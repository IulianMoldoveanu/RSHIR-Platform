// v3 Loop 3 — restaurant-champion attribution helper.
//
// Called by the tenant signup flow when the new tenant has a `?champion=`
// query param. Resolves the code → referrer tenant, creates the
// champion_referrals row (status='pending'), and extends the new tenant's
// trial to 60 days total.
//
// Wire from the signup server action / API route that creates a tenant.
// Returns null on failure (unknown code, dedup violation) — the new tenant
// signup itself MUST succeed even if attribution fails (don't break signups).

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

  const admin = createAdminClient();

  // 1. Resolve code → referrer tenant
  const { data: referrer, error: refErr } = await admin
    .from('tenants')
    .select('id, trial_ends_at')
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

  // 3. Extend new tenant's trial by CHAMPION_TRIAL_EXT_DAYS (30 → 60 days total)
  // Read existing trial_ends_at, add the extension.
  const { data: newT } = await admin
    .from('tenants')
    .select('trial_ends_at')
    .eq('id', newTenantId)
    .maybeSingle();

  if (newT?.trial_ends_at) {
    const current = new Date(newT.trial_ends_at);
    const extended = new Date(
      current.getTime() + V3_CONSTANTS.CHAMPION_TRIAL_EXT_DAYS * 24 * 60 * 60 * 1000,
    );
    const { error: extErr } = await admin
      .from('tenants')
      .update({ trial_ends_at: extended.toISOString() })
      .eq('id', newTenantId);

    if (extErr) {
      console.warn(
        '[champion-attribution] trial extension failed (non-fatal)',
        extErr.message,
      );
    }
  }

  return { ok: true, referrerTenantId: referrer.id };
}
