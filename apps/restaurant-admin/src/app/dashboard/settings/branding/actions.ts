'use server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';

const BRANDING_BUCKET = 'tenant-branding';
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);
const MAX_BYTES = 4 * 1024 * 1024;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

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
  if (sub === 'svg+xml') return 'svg';
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

  const path = `${expectedTenantId}/${kind}.${extFromMime(file.type)}`;
  const admin = createAdminClient();

  const { error: uploadErr } = await admin.storage
    .from(BRANDING_BUCKET)
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: true,
    });
  if (uploadErr) return { ok: false, error: 'storage_error', detail: uploadErr.message };

  const { state, rawSettings } = await readBranding(expectedTenantId);
  const next: BrandingState = {
    ...state,
    [kind === 'logo' ? 'logo_url' : 'cover_url']: publicUrlFor(path),
  };
  const merged = {
    ...rawSettings,
    branding: {
      ...((rawSettings.branding as Record<string, unknown>) ?? {}),
      ...next,
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
  const merged = {
    ...rawSettings,
    branding: {
      ...((rawSettings.branding as Record<string, unknown>) ?? {}),
      ...next,
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
