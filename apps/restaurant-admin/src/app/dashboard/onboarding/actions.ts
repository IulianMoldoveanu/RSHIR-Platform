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

export async function goLiveAction(): Promise<void> {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);
  if (role !== 'OWNER') throw new Error('forbidden_owner_only');

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenant.id)
    .single();
  if (readErr || !existing) throw new Error(readErr?.message ?? 'tenant_read_failed');

  const merged = deepMerge((existing.settings as Record<string, unknown>) ?? {}, {
    is_accepting_orders: true,
    onboarding: {
      went_live: true,
      completed_at: new Date().toISOString(),
    },
  });

  const { error: writeErr } = await admin
    .from('tenants')
    .update({ settings: merged as never })
    .eq('id', tenant.id);
  if (writeErr) throw new Error(writeErr.message);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/onboarding');
  redirect('/dashboard');
}
