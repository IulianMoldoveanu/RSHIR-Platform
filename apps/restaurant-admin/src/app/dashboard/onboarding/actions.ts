'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';

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

// RSHIR-26 M-3: caller passes the tenantId rendered server-side. We refuse
// the write if the cookie-derived active tenant no longer matches — closes
// the multi-tenant cookie-race where a user with memberships in two tenants
// could flip the wrong tenant's "go live" by switching tabs mid-flight.
export async function goLiveAction(formData: FormData): Promise<void> {
  const expectedTenantId = String(formData.get('tenantId') ?? '');
  if (!expectedTenantId) throw new Error('missing_tenant_id');

  const { user, tenant } = await getActiveTenant();
  if (tenant.id !== expectedTenantId) throw new Error('tenant_mismatch');

  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') throw new Error('forbidden_owner_only');

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', expectedTenantId)
    .single();
  if (readErr || !existing) throw new Error(readErr?.message ?? 'tenant_read_failed');

  const nowIso = new Date().toISOString();
  const merged = deepMerge((existing.settings as Record<string, unknown>) ?? {}, {
    is_accepting_orders: true,
    onboarding: {
      went_live: true,
      completed_at: nowIso,
      went_live_at: nowIso,
    },
  });

  const { error: writeErr } = await admin
    .from('tenants')
    .update({ settings: merged as never })
    .eq('id', expectedTenantId);
  if (writeErr) throw new Error(writeErr.message);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/onboarding');
  redirect('/dashboard');
}
