// HIR — Champion Rewards Verify (v3 Loop 3 — state machine cron)
//
// Walks champion_referrals rows and advances the reward state machine:
//   pending      → trial_active   when referred tenant has any auth user
//                                  AND is not yet on day-30 of trial
//   trial_active → verified       when referred tenant has at least one
//                                  PAID restaurant_orders row (= first
//                                  paying month). Stamps verified_at.
//   verified     → paid           when free_months_credited > 0 AND
//                                  cash_bonus_cents > 0. (Operator-side
//                                  triggers payout via partner_payouts;
//                                  this flips status to paid.)
//   any → void                    when referred tenant churns (settings
//                                  flag, audit_log) — manual void only,
//                                  not auto, to avoid losing legit referrals
//                                  during temporary downtime.
//
// Schedule: pg_cron 4 times per day (06:00/12:00/18:00/00:00 RO local =
// 04:00/10:00/16:00/22:00 UTC summer-DST, close enough for daily verify).
// See migration 20260517_001_v3_champion_rewards_cron.sql.
//
// Auth: shared-secret header x-hir-notify-secret (env HIR_NOTIFY_SECRET).
// Required env: HIR_NOTIFY_SECRET
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Query params:
//   ?dry_run=true  — compute the would-be transitions, do not write

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { withRunLog } from '../_shared/log.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const CHAMPION_CASH_CENTS = 10000; // €100, mirrors V3_CONSTANTS.CHAMPION_CASH_CENTS
const CHAMPION_FREE_MONTHS = 1; // mirrors V3_CONSTANTS.CHAMPION_FREE_MONTHS

type ChampionRow = {
  id: string;
  referrer_tenant_id: string;
  referred_tenant_id: string;
  referred_at: string;
  reward_status: 'pending' | 'trial_active' | 'verified' | 'paid' | 'void';
  free_months_credited: number;
  cash_bonus_cents: number;
  verified_at: string | null;
  paid_at: string | null;
};

// deno-lint-ignore no-explicit-any
async function fetchReferrals(supabase: any): Promise<ChampionRow[]> {
  const { data, error } = await supabase
    .from('champion_referrals')
    .select(
      'id, referrer_tenant_id, referred_tenant_id, referred_at, reward_status, free_months_credited, cash_bonus_cents, verified_at, paid_at',
    )
    .in('reward_status', ['pending', 'trial_active', 'verified']);
  if (error) throw new Error(`fetch referrals failed: ${error.message}`);
  return (data ?? []) as ChampionRow[];
}

// Has the referred tenant placed at least one DELIVERED+PAID order?
// We use this as the "first paying month verified" gate — matches the
// partner-commission-calc HIR fee model (Tier 1: €0.54/delivered+paid).
// deno-lint-ignore no-explicit-any
async function hasPaidOrders(supabase: any, tenantId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('restaurant_orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'DELIVERED')
    .eq('payment_status', 'PAID')
    .limit(1);
  if (error) {
    console.warn('[champion-rewards-verify] hasPaidOrders error', error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });

  const expected = Deno.env.get('HIR_NOTIFY_SECRET');
  const provided = req.headers.get('x-hir-notify-secret');
  if (!expected || provided !== expected) {
    return json(401, { ok: false, error: 'unauthorized' });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === 'true';

  return withRunLog('champion-rewards-verify', async (setMetadata) => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    });

    const rows = await fetchReferrals(supabase);

    const transitions = {
      pending_to_trial_active: 0,
      trial_active_to_verified: 0,
      verified_to_paid: 0,
      skipped: 0,
      errored: 0,
    };

    for (const row of rows) {
      try {
        if (row.reward_status === 'pending') {
          // pending → trial_active: just flip after first call (the
          // referred tenant exists by construction since signup created it).
          if (!dryRun) {
            const { error } = await supabase
              .from('champion_referrals')
              .update({ reward_status: 'trial_active' })
              .eq('id', row.id);
            if (error) {
              transitions.errored += 1;
              continue;
            }
          }
          transitions.pending_to_trial_active += 1;
          continue;
        }

        if (row.reward_status === 'trial_active') {
          const paid = await hasPaidOrders(supabase, row.referred_tenant_id);
          if (paid) {
            if (!dryRun) {
              const { error } = await supabase
                .from('champion_referrals')
                .update({
                  reward_status: 'verified',
                  verified_at: new Date().toISOString(),
                  free_months_credited: CHAMPION_FREE_MONTHS,
                  cash_bonus_cents: CHAMPION_CASH_CENTS,
                })
                .eq('id', row.id);
              if (error) {
                transitions.errored += 1;
                continue;
              }
            }
            transitions.trial_active_to_verified += 1;
          } else {
            transitions.skipped += 1;
          }
          continue;
        }

        if (row.reward_status === 'verified') {
          // verified → paid: gate on free_months_credited > 0 AND cash_bonus_cents > 0.
          // Operator-side payout (partner_payouts) is a separate manual step;
          // this Edge Fn only flips status once both rewards have been applied.
          if (row.free_months_credited > 0 && row.cash_bonus_cents > 0 && row.paid_at === null) {
            // Default automatic verify→paid (no separate manual gate yet).
            // Iulian can override by manually nulling free_months_credited or
            // cash_bonus_cents to "park" a row before payout.
            if (!dryRun) {
              const { error } = await supabase
                .from('champion_referrals')
                .update({
                  reward_status: 'paid',
                  paid_at: new Date().toISOString(),
                })
                .eq('id', row.id);
              if (error) {
                transitions.errored += 1;
                continue;
              }
            }
            transitions.verified_to_paid += 1;
          } else {
            transitions.skipped += 1;
          }
        }
      } catch (e) {
        console.error('[champion-rewards-verify] row error', row.id, e);
        transitions.errored += 1;
      }
    }

    const summary = {
      ok: true,
      dry_run: dryRun,
      rows_processed: rows.length,
      transitions,
    };
    console.log('[champion-rewards-verify] summary', summary);
    setMetadata(summary);
    return json(200, summary);
  });
});
