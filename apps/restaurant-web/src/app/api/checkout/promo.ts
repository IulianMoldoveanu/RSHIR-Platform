import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@hir/supabase-types';

export type PromoKind = 'PERCENT' | 'FIXED' | 'FREE_DELIVERY';

export type PromoLookupFailure =
  | 'not_found'
  | 'inactive'
  | 'expired'
  | 'min_not_met'
  | 'usage_exhausted';

export type PromoRecord = {
  id: string;
  code: string;
  kind: PromoKind;
  value_int: number;
  min_order_ron: number;
  max_uses: number | null;
  used_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
};

export type PromoValidation =
  | { ok: true; promo: PromoRecord; discountRon: number }
  | { ok: false; reason: PromoLookupFailure };

const CODE_RE = /^[A-Z0-9_-]{2,32}$/;

export function normalizePromoCode(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase();
  return CODE_RE.test(upper) ? upper : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Computes the discount RON for a promo against a given subtotal/delivery.
 * Caller must clamp the resulting total at 0; this helper only rounds and
 * caps the discount at the relevant base (subtotal for PERCENT/FIXED, the
 * full delivery_fee_ron for FREE_DELIVERY).
 */
export function discountFor(
  promo: Pick<PromoRecord, 'kind' | 'value_int'>,
  subtotalRon: number,
  deliveryFeeRon: number,
): number {
  if (promo.kind === 'PERCENT') {
    return round2(Math.min((subtotalRon * promo.value_int) / 100, subtotalRon));
  }
  if (promo.kind === 'FIXED') {
    return round2(Math.min(promo.value_int, subtotalRon));
  }
  // FREE_DELIVERY
  return round2(deliveryFeeRon);
}

/**
 * Looks up a promo by tenant + (uppercased) code and validates time/usage
 * windows + min-order. Time gates apply only when set; max_uses is left to
 * the atomic claim function — we still surface a friendly error here when
 * used_count >= max_uses so the user gets immediate feedback.
 */
export async function lookupAndValidatePromo(
  admin: SupabaseClient<Database>,
  tenantId: string,
  rawCode: string,
  subtotalRon: number,
  deliveryFeeRon: number,
): Promise<PromoValidation> {
  const code = normalizePromoCode(rawCode);
  if (!code) return { ok: false, reason: 'not_found' };

  const { data, error } = await admin
    .from('promo_codes')
    .select(
      'id, code, kind, value_int, min_order_ron, max_uses, used_count, valid_from, valid_until, is_active',
    )
    .eq('tenant_id', tenantId)
    .eq('code', code)
    .maybeSingle();

  if (error) throw new Error(`promo lookup failed: ${error.message}`);
  if (!data) return { ok: false, reason: 'not_found' };

  const promo = data as unknown as PromoRecord;
  if (!promo.is_active) return { ok: false, reason: 'inactive' };

  const now = Date.now();
  if (promo.valid_from && Date.parse(promo.valid_from) > now) {
    return { ok: false, reason: 'expired' };
  }
  if (promo.valid_until && Date.parse(promo.valid_until) < now) {
    return { ok: false, reason: 'expired' };
  }
  if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
    return { ok: false, reason: 'usage_exhausted' };
  }
  if (subtotalRon < Number(promo.min_order_ron)) {
    return { ok: false, reason: 'min_not_met' };
  }

  return {
    ok: true,
    promo,
    discountRon: discountFor(promo, subtotalRon, deliveryFeeRon),
  };
}
