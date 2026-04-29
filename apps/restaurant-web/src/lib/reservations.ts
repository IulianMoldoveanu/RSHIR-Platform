import { getSupabaseAdmin } from './supabase-admin';

export async function isReservationsEnabled(tenantId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data } = await sb
    .from('reservation_settings')
    .select('is_enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data?.is_enabled === true;
}
