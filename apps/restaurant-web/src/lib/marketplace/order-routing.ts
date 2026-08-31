// Lane HIRforYOU-MARKETPLACE (2026-05-28) — order routing for marketplace
// orders.
//
// A marketplace order is a `restaurant_orders` row with
// `order_source='marketplace'` and `marketplace_customer_id` set. The tenant
// admin dashboard treats it identically to a direct order (same KDS, same
// realtime channel, same status flow) — the only difference is the HIR take
// rate (2 RON flat) charged via the connect-invoice-weekly Edge Function.
//
// MVP scope: one cart = one tenant. No cross-restaurant unified carts.
// The existing storefront cart already enforces this (the cart lives in
// sessionStorage keyed per-tenant-host), so the marketplace flow just
// reuses the existing checkout pipeline with the additional metadata.

import 'server-only';

export type MarketplaceCustomerInput = {
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
  authUserId?: string | null;
};

export type MarketplaceOrderItem = {
  itemId: string;
  name: string;
  priceRon: number;
  quantity: number;
  modifiers?: Array<{
    id: string;
    name: string;
    priceDeltaRon: number;
  }>;
  notes?: string | null;
};

export type CreateMarketplaceOrderInput = {
  tenantId: string;
  customer: MarketplaceCustomerInput;
  items: MarketplaceOrderItem[];
  deliveryFeeRon: number;
  notes?: string | null;
};

export type MarketplaceOrderTotals = {
  subtotalRon: number;
  deliveryFeeRon: number;
  totalRon: number;
  /** HIR take rate billed to the tenant via connect-invoice-weekly. */
  hirTakeRon: number;
  /** Tenant's net before card fees. */
  tenantNetRon: number;
};

/**
 * Take rate is currently flat 2 RON/marketplace-order. Pulled from env so it
 * can be tuned without a code change, but defaults match the LOCKED pricing
 * decision (see decision_pricing_2plus1_2026-05-09 in coordinator memory).
 *
 * Read in:
 *   - this module (totals computation)
 *   - connect-invoice-weekly Edge Function (weekly settlement)
 *
 * Keep these in sync. The Edge Function reads its own env so this file is
 * not authoritative for billing — it's a UI-side estimate only.
 */
export const HIR_MARKETPLACE_TAKE_RON = (() => {
  const raw = process.env.HIR_MARKETPLACE_TAKE_RON;
  if (!raw) return 2;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 2;
})();

/**
 * Compute totals for a marketplace order. Pure function — no DB access.
 * Caller passes the deliveryFeeRon already resolved (zone-pricing logic
 * lives in the existing storefront pipeline; we reuse it via the quote
 * API). Returns rounded-to-cent (2 decimal) values.
 */
export function computeMarketplaceTotals(
  items: MarketplaceOrderItem[],
  deliveryFeeRon: number,
): MarketplaceOrderTotals {
  let subtotalRon = 0;
  for (const it of items) {
    if (it.quantity <= 0) continue;
    let lineRon = it.priceRon;
    for (const m of it.modifiers ?? []) {
      lineRon += m.priceDeltaRon;
    }
    subtotalRon += lineRon * it.quantity;
  }
  const safeSubtotal = round2(subtotalRon);
  const safeDelivery = round2(Math.max(0, deliveryFeeRon));
  const total = round2(safeSubtotal + safeDelivery);
  const hirTake = round2(Math.min(HIR_MARKETPLACE_TAKE_RON, total));
  const tenantNet = round2(total - hirTake);
  return {
    subtotalRon: safeSubtotal,
    deliveryFeeRon: safeDelivery,
    totalRon: total,
    hirTakeRon: hirTake,
    tenantNetRon: tenantNet,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Validate the customer input. Returns an error code or null when valid.
 * Caller is expected to surface a localized message based on the code.
 */
export function validateMarketplaceCustomer(
  input: MarketplaceCustomerInput,
): { code: string } | null {
  const hasEmail = !!(input.email && input.email.trim().length > 0);
  const hasPhone = !!(input.phone && input.phone.trim().length > 0);
  if (!hasEmail && !hasPhone) {
    return { code: 'marketplace.customer.missing_contact' };
  }
  if (hasEmail && !EMAIL_RE.test(input.email!.trim())) {
    return { code: 'marketplace.customer.invalid_email' };
  }
  if (hasPhone && !PHONE_RE.test(input.phone!.trim())) {
    return { code: 'marketplace.customer.invalid_phone' };
  }
  return null;
}

// Conservative validators — favour false-rejects over leaks. The auth flow
// downstream (magic link / OTP) has its own validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// E.164-ish: optional +, country code, 6-15 digits total. Romanian mobile
// numbers (+40 7xx xxx xxx) match; landlines (+40 2xx xxx xxx) also match.
const PHONE_RE = /^\+?[0-9\s().-]{6,20}$/;

/**
 * Upsert a marketplace customer by email-or-phone. Returns the id of the
 * existing-or-new row. Service-role only — bypasses RLS so guest checkouts
 * (no auth) still work.
 *
 * Called from the API route handlers, not from server components, so the
 * service-role client is constructed by the caller via `getSupabaseAdmin()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertMarketplaceCustomer(admin: any, input: MarketplaceCustomerInput): Promise<string> {
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  const fullName = input.fullName?.trim() || null;
  const authUserId = input.authUserId || null;

  // Prefer email match (more stable), fall back to phone.
  let existingId: string | null = null;
  if (email) {
    const { data } = await admin
      .from('marketplace_customers')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    existingId = data?.id ?? null;
  }
  if (!existingId && phone) {
    const { data } = await admin
      .from('marketplace_customers')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();
    existingId = data?.id ?? null;
  }

  if (existingId) {
    await admin
      .from('marketplace_customers')
      .update({
        full_name: fullName,
        auth_user_id: authUserId,
        last_active_at: new Date().toISOString(),
      })
      .eq('id', existingId);
    return existingId;
  }

  const { data: inserted, error } = await admin
    .from('marketplace_customers')
    .insert({
      email,
      phone,
      full_name: fullName,
      auth_user_id: authUserId,
    })
    .select('id')
    .single();
  if (error || !inserted) {
    throw new Error(`marketplace customer upsert failed: ${error?.message ?? 'unknown'}`);
  }
  return inserted.id as string;
}
