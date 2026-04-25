'use server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';

const BRANDING_BUCKET = 'tenant-branding';
// RSHIR-31 H-3: image/svg+xml dropped. SVG can carry <script> / <foreignObject>
// payloads that execute when the storage URL is opened directly (storage origin)
// or rendered by tools that inline SVG content. Raster only.
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);
const MAX_BYTES = 4 * 1024 * 1024;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// RSHIR-31 H-4: magic-byte check. The browser-supplied `file.type` is
// attacker-controlled; rename a JS payload to logo.png and the bucket
// accepts it. Verify the actual leading bytes before upload.
function matchesDeclaredMime(mime: string, bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes.slice(0, 12));
  if (head.length < 4) return false;
  if (mime === 'image/png') {
    return (
      head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
      head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
    );
  }
  if (mime === 'image/jpeg') {
    return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  }
  if (mime === 'image/webp') {
    // RIFF....WEBP
    return (
      head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
      head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
    );
  }
  return false;
}

export type BrandingKind = 'logo' | 'cover';

export type BrandingActionResult =
  | { ok: true; branding: BrandingState }
  | {
      ok: false;
      error:
        | 'forbidden_owner_only'
        | 'unauthenticated'
        | 'invalid_input'
        | 'tenant_mismatch'
        | 'storage_error'
        | 'db_error';
      detail?: string;
    };

export type BrandingState = {
  logo_url: string | null;
  cover_url: string | null;
  brand_color: string;
};

export const DEFAULT_BRAND_COLOR = '#7c3aed';

function publicUrlFor(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // Cache-bust on each upload so replacing logo/cover takes effect immediately.
  return `${base}/storage/v1/object/public/${BRANDING_BUCKET}/${path}?v=${Date.now()}`;
}

function extFromMime(mime: string): string {
  const sub = mime.split('/')[1];
  if (sub === 'jpeg') return 'jpg';
  return sub;
}

async function readBranding(tenantId: string): Promise<{
  state: BrandingState;
  rawSettings: Record<string, unknown>;
}> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .maybeSingle();
  const rawSettings = (data?.settings as Record<string, unknown> | null) ?? {};
  const branding = (rawSettings.branding as Record<string, unknown> | undefined) ?? {};
  const state: BrandingState = {
    logo_url: typeof branding.logo_url === 'string' ? branding.logo_url : null,
    cover_url: typeof branding.cover_url === 'string' ? branding.cover_url : null,
    brand_color:
      typeof branding.brand_color === 'string' && HEX_RE.test(branding.brand_color)
        ? branding.brand_color
        : DEFAULT_BRAND_COLOR,
  };
  return { state, rawSettings };
}

export async function uploadBrandingAsset(
  formData: FormData,
): Promise<BrandingActionResult> {
  const kind = formData.get('kind');
  const file = formData.get('file');
  const expectedTenantId = formData.get('tenantId');
  if (
    (kind !== 'logo' && kind !== 'cover') ||
    !(file instanceof File) ||
    typeof expectedTenantId !== 'string' ||
    !expectedTenantId
  ) {
    return { ok: false, error: 'invalid_input' };
  }

  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null,
    tenant: null,
  }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== expectedTenantId) {
    return { ok: false, error: 'tenant_mismatch' };
  }
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: 'invalid_input', detail: `mime_not_allowed:${file.type}` };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: 'invalid_input', detail: 'file_over_4mb' };
  }

  const bytes = await file.arrayBuffer();
  if (!matchesDeclaredMime(file.type, bytes)) {
    return { ok: false, error: 'invalid_input', detail: 'mime_content_mismatch' };
  }

  const path = `${expectedTenantId}/${kind}.${extFromMime(file.type)}`;
  const admin = createAdminClient();

  const { error: uploadErr } = await admin.storage
    .from(BRANDING_BUCKET)
    .upload(path, bytes, {
      contentType: file.type,
      upsert: true,
    });
  if (uploadErr) return { ok: false, error: 'storage_error', detail: uploadErr.message };

  const { state, rawSettings } = await readBranding(expectedTenantId);
  const next: BrandingState = {
    ...state,
    [kind === 'logo' ? 'logo_url' : 'cover_url']: publicUrlFor(path),
  };
  // RSHIR-32 M-3: write branding from a strict allowlist. Any unknown keys
  // a previous bad write may have set under `branding` are dropped here.
  const merged = {
    ...rawSettings,
    branding: {
      logo_url: next.logo_url,
      cover_url: next.cover_url,
      brand_color: next.brand_color,
    },
  };

  const { error: writeErr } = await admin
    .from('tenants')
    .update({ settings: merged as never })
    .eq('id', expectedTenantId);
  if (writeErr) return { ok: false, error: 'db_error', detail: writeErr.message };

  revalidatePath('/dashboard/settings/branding');
  return { ok: true, branding: next };
}

export async function setBrandColor(
  hex: string,
  expectedTenantId: string,
): Promise<BrandingActionResult> {
  if (typeof hex !== 'string' || !HEX_RE.test(hex)) {
    return { ok: false, error: 'invalid_input', detail: 'expected #rrggbb' };
  }
  if (!expectedTenantId) return { ok: false, error: 'invalid_input' };

  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null,
    tenant: null,
  }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== expectedTenantId) {
    return { ok: false, error: 'tenant_mismatch' };
  }
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const { state, rawSettings } = await readBranding(expectedTenantId);
  const next: BrandingState = { ...state, brand_color: hex.toLowerCase() };
  // RSHIR-32 M-3: strict allowlist; see uploadBrandingAsset for rationale.
  const merged = {
    ...rawSettings,
    branding: {
      logo_url: next.logo_url,
      cover_url: next.cover_url,
      brand_color: next.brand_color,
    },
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from('tenants')
    .update({ settings: merged as never })
    .eq('id', expectedTenantId);
  if (error) return { ok: false, error: 'db_error', detail: error.message };

  revalidatePath('/dashboard/settings/branding');
  return { ok: true, branding: next };
}
