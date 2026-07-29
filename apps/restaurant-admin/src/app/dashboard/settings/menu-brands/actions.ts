'use server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import type { MenuBrandActionResult, MenuBrandRow } from './types';

// Same bucket family as tenant branding (logo/cover) — separate prefix per
// brand row so multiple brands under one tenant don't collide.
const BRANDING_BUCKET = 'tenant-branding';
// SVG dropped for the same reason as settings/branding/actions.ts (RSHIR-31
// H-3): can carry <script>/<foreignObject> payloads. Raster only.
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 4 * 1024 * 1024;

// RSHIR-31 H-4 pattern: file.type is attacker-controlled, verify magic bytes.
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
    return (
      head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
      head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
    );
  }
  return false;
}

function extFromMime(mime: string): string {
  const sub = mime.split('/')[1];
  return sub === 'jpeg' ? 'jpg' : sub;
}

function publicUrlFor(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${base}/storage/v1/object/public/${BRANDING_BUCKET}/${path}?v=${Date.now()}`;
}

// restaurant_menu_brands isn't in generated Supabase types yet — same
// untyped-chainable cast pattern as lib/audit.ts.
type MenuBrandsTable = {
  from: (t: 'restaurant_menu_brands') => {
    select: (cols: string) => {
      eq: (col: string, val: string) => Promise<{ data: MenuBrandRow[] | null; error: { message: string } | null }>;
    };
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
};

export async function listMenuBrands(tenantId: string): Promise<MenuBrandRow[]> {
  const admin = createAdminClient() as unknown as MenuBrandsTable;
  const { data, error } = await admin.from('restaurant_menu_brands').select(
    'id, slug, name, tagline, logo_url, cover_url, sort_order, is_active',
  ).eq('tenant_id', tenantId);
  if (error || !data) return [];
  return [...data].sort((a, b) => a.sort_order - b.sort_order);
}

export async function uploadMenuBrandLogo(formData: FormData): Promise<MenuBrandActionResult> {
  const brandId = formData.get('brandId');
  const file = formData.get('file');
  const expectedTenantId = formData.get('tenantId');
  if (
    typeof brandId !== 'string' || !brandId ||
    !(file instanceof File) ||
    typeof expectedTenantId !== 'string' || !expectedTenantId
  ) {
    return { ok: false, error: 'invalid_input' };
  }

  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };
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

  const path = `${expectedTenantId}/menu-brand-${brandId}.${extFromMime(file.type)}`;
  const admin = createAdminClient();
  const { error: uploadErr } = await admin.storage
    .from(BRANDING_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (uploadErr) return { ok: false, error: 'storage_error', detail: uploadErr.message };

  const logoUrl = publicUrlFor(path);
  const brandsAdmin = admin as unknown as MenuBrandsTable;
  // Scope the update by BOTH id and tenant_id — belt-and-suspenders against
  // a brandId from another tenant slipping through (tenant_mismatch above
  // already blocks a mismatched tenantId, this blocks a mismatched brandId).
  const { error: writeErr } = await brandsAdmin
    .from('restaurant_menu_brands')
    .update({ logo_url: logoUrl })
    .eq('id', brandId)
    .eq('tenant_id', expectedTenantId);
  if (writeErr) return { ok: false, error: 'db_error', detail: writeErr.message };

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'branding.logo_uploaded',
    entityType: 'restaurant_menu_brands',
    entityId: brandId,
    metadata: { mime: file.type, size: file.size },
  });

  revalidatePath('/dashboard/settings/menu-brands');
  return { ok: true, logo_url: logoUrl };
}
