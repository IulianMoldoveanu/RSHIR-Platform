import { createAdminClient } from './supabase/admin';

export type TenantDeliveryMode = 'full_saas' | 'headless';

/**
 * Fetches the delivery_mode for a tenant from the DB.
 * Returns 'full_saas' as a safe default if the row or column is missing
 * (e.g., pre-migration local dev environments).
 */
export async function getTenantDeliveryMode(tenantId: string): Promise<TenantDeliveryMode> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tenants')
    .select('delivery_mode')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !data) return 'full_saas';

  const mode = (data as { delivery_mode?: string }).delivery_mode;
  return mode === 'headless' ? 'headless' : 'full_saas';
}

export function isHeadless(mode: TenantDeliveryMode): boolean {
  return mode === 'headless';
}
