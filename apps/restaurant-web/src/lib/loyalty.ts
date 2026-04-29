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

export type LoyaltyLedgerEntry = {
  id: number;
  kind: 'earned' | 'redeemed' | 'expired' | 'adjusted' | 'welcome_bonus';
  points: number;
  createdAt: string;
};

/** Returns the customer's most recent loyalty ledger entries (newest first).
 *  Empty array when the customer has no account. */
export async function getLoyaltyHistory(
  tenantId: string,
  customerId: string,
  limit = 5,
): Promise<LoyaltyLedgerEntry[]> {
  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data } = await sb
    .from('loyalty_ledger')
    .select('id, kind, points, created_at')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (!Array.isArray(data)) return [];
  return data.map((r) => ({
    id: r.id as number,
    kind: r.kind as LoyaltyLedgerEntry['kind'],
    points: r.points as number,
    createdAt: r.created_at as string,
  }));
}

export type RedemptionValidation =
  | { ok: true; discountRon: number; settings: Settings }
  | {
      ok: false;
      reason:
        | 'loyalty_disabled'
        | 'no_account'
        | 'below_min'
        | 'insufficient_balance'
        | 'exceeds_cap';
    };

/** Validates a redemption attempt against settings + balance + the cap.
 *  Returns the RON discount the redemption is worth, or a typed reason.
 *  Caller must still call fn_loyalty_redeem to atomically deduct. */
export async function validateRedemption(
  tenantId: string,
  customerId: string,
  redeemPoints: number,
  totalRon: number,
): Promise<RedemptionValidation> {
  const balance = await getLoyaltyBalance(tenantId, customerId);
  if (!balance) {
    // getLoyaltyBalance returns null when settings missing/disabled OR
    // balance is 0 — either way we can't redeem.
    return { ok: false, reason: balance === null ? 'no_account' : 'loyalty_disabled' };
  }
  const { settings, points } = balance;
  if (redeemPoints < settings.min_points_to_redeem) {
    return { ok: false, reason: 'below_min' };
  }
  if (redeemPoints > points) {
    return { ok: false, reason: 'insufficient_balance' };
  }
  const discountRon = Number((redeemPoints * settings.ron_per_point).toFixed(2));
  const cap = Number(((totalRon * settings.max_redemption_pct) / 100).toFixed(2));
  if (discountRon > cap) {
    return { ok: false, reason: 'exceeds_cap' };
  }
  return { ok: true, discountRon, settings };
}
