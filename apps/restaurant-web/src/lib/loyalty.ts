import { getSupabaseAdmin } from './supabase-admin';

type Settings = {
  is_enabled: boolean;
  min_points_to_redeem: number;
  ron_per_point: number;
  max_redemption_pct: number;
};

export type LoyaltyBalance = {
  points: number;
  settings: Settings;
};

/** Fetches the cookie-recognized customer's loyalty balance. Returns null
 *  when loyalty is disabled, the customer has no account, or balance is 0. */
export async function getLoyaltyBalance(
  tenantId: string,
  customerId: string,
): Promise<LoyaltyBalance | null> {
  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: settingsRow } = await sb
    .from('loyalty_settings')
    .select('is_enabled, min_points_to_redeem, ron_per_point, max_redemption_pct')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const settings = settingsRow as Settings | null;
  if (!settings || !settings.is_enabled) return null;

  const { data: accountRow } = await sb
    .from('loyalty_accounts')
    .select('balance_points')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle();

  const points = (accountRow as { balance_points: number } | null)?.balance_points ?? 0;
  if (points <= 0) return null;

  return { points, settings };
}
