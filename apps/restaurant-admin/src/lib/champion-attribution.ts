// v3 Loop 3 — restaurant-champion attribution helper.
//
// Called by the tenant signup flow when the new tenant has a `?champion=`
// query param. Resolves the code → referrer tenant and creates the
// champion_referrals row (status='pending').
//
// Trial extension (champion → 60-day trial vs 30-day default) is tracked
// via `champion_referrals.trial_extended_days` only — the tenants schema
// has no canonical trial_ends_at column yet, and the rewards monitor cron
// (separate followup) reads the days field when verifying.
//
// The v3 reseller tables (champion_referrals + tenants.champion_code) are
// not yet in the generated supabase-types — cast the admin client to any.
// All queries are read-only or simple inserts; pgRest validates at runtime.
//
// Returns ok=false with a `reason` on failure — callers should swallow
// errors so the underlying tenant signup never blocks on attribution.

import { createAdminClient } from '@/lib/supabase/admin';
import { V3_CONSTANTS } from '@/lib/partner-v3-constants';

type AttachResult = {
  ok: boolean;
  referrerTenantId?: string;
  reason?: string;
};

export async function attachChampion(
  newTenantId: string,
  championCode: string,
): Promise<AttachResult> {
  if (!championCode || championCode.length < 6) {
    return { ok: false, reason: 'invalid_code_format' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // 1. Resolve code → referrer tenant
  const { data: referrer, error: refErr } = await admin
    .from('tenants')
    .select('id')
    .eq('champion_code', championCode.toUpperCase())
    .maybeSingle();

  if (refErr || !referrer) {
    console.warn('[champion-attribution] unknown code', { championCode, error: refErr?.message });
    return { ok: false, reason: 'unknown_code' };
  }

  if (referrer.id === newTenantId) {
    return { ok: false, reason: 'self_referral_blocked' };
  }

  // 2. Insert champion_referrals row (unique on referred_tenant_id — at most one champion per tenant)
  const { error: insErr } = await admin.from('champion_referrals').insert({
    referrer_tenant_id: referrer.id,
    referred_tenant_id: newTenantId,
    reward_status: 'pending',
    trial_extended_days: V3_CONSTANTS.CHAMPION_TRIAL_EXT_DAYS,
  });

  if (insErr) {
    // Unique violation = already attributed = fine, idempotent
    if (insErr.code === '23505') {
      return { ok: false, reason: 'already_attributed' };
    }
    console.error('[champion-attribution] insert failed', insErr.message);
    return { ok: false, reason: 'insert_failed' };
  }

  return { ok: true, referrerTenantId: referrer.id };
}
