'use server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';

export type SeoSettings = {
  cuisine: string | null;
  meta_description: string | null;
};

export type SeoActionResult =
  | { ok: true; settings: SeoSettings }
  | {
      ok: false;
      error: 'forbidden_owner_only' | 'unauthenticated' | 'invalid_input' | 'db_error';
      detail?: string;
    };

const CUISINE_MAX = 80;
const META_DESC_MAX = 200;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    const bv = out[k];
    out[k] = isPlainObject(bv) && isPlainObject(pv) ? deepMerge(bv, pv) : pv;
  }
  return out;
}

export async function saveSeoAction(
  input: SeoSettings,
  expectedTenantId: string,
): Promise<SeoActionResult> {
  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null,
    tenant: null,
  }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (!expectedTenantId || tenant.id !== expectedTenantId) {
    return { ok: false, error: 'invalid_input', detail: 'tenant_mismatch' };
  }
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const cuisine =
    typeof input.cuisine === 'string' ? input.cuisine.trim().slice(0, CUISINE_MAX) : '';
  const metaDescription =
    typeof input.meta_description === 'string'
      ? input.meta_description.trim().slice(0, META_DESC_MAX)
      : '';

  const payload = {
    cuisine: cuisine || null,
    meta_description: metaDescription || null,
  };

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', expectedTenantId)
    .single();
  if (readErr || !existing) return { ok: false, error: 'db_error', detail: readErr?.message };

  const merged = deepMerge(
    (existing.settings as Record<string, unknown>) ?? {},
    payload as Record<string, unknown>,
  );

  const { error: writeErr } = await admin
    .from('tenants')
    .update({ settings: merged as never })
    .eq('id', expectedTenantId);
  if (writeErr) return { ok: false, error: 'db_error', detail: writeErr.message };

  revalidatePath('/dashboard/settings/seo');
  return { ok: true, settings: payload };
}
