// HIR — Bonus Monthly Calculator v3
//
// Computes recurring activity + ladder bonuses for each ACTIVE partner.
// Runs on the 2nd of each month at 02:00 UTC (04:00 Europe/Bucharest),
// AFTER partner-commission-calc (03:00 RO / 01:00 UTC).
//
// Bonus types handled:
//   STREAK        — ≥3 restaurants referred in period → €100
//   QUALITY       — all active ≥6mo restaurants avg ≥100 ord/day → €150
//   SPEED         — restaurant LIVE within 14d of referred_at → €50
//   QUICK_WIN     — restaurant closed within 14d of referred_at → €100 (cap 5/partner lifetime)
//   MENTOR_BRONZE — sub-reseller crosses 5 restaurants in period → €200
//   TEAM_BUILDER  — team (all subs) brings ≥15 rest in period → €500
//   MENTOR_MONTH  — single highest-scoring sponsor per period → €1,000
//   QUARTER_STREAK — ≥3 rest in each of 3 months of quarter (runs at quarter-end) → €1,500
//   LADDER        — partner crosses Bronze/Silver/Gold/Platinum/Diamond threshold → award inserted
//
// Auth: x-hir-notify-secret header (shared secret, env HIR_NOTIFY_SECRET).
// Idempotent: recurring bonuses use (partner_id, bonus_type, period_start) partial unique;
//             MENTOR_BRONZE uses (partner_id, 'MENTOR_BRONZE', period_start) + context sub;
//             ladder uses (partner_id, tier_reached) unique — all via ON CONFLICT DO NOTHING.
//
// Query params:
//   ?period=YYYY-MM  — override period (default: previous month)
//   ?dry_run=true    — compute but do not write, return summary
//
// Required env: HIR_NOTIFY_SECRET
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { withRunLog } from '../_shared/log.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// ────────────────────────────────────────────────────────────
// Constants — sourced from partner-v3-constants.ts values
// (re-declared here so the Edge Function has no TS project import)
// ────────────────────────────────────────────────────────────
const STREAK_CENTS = 10000; // €100
const STREAK_MIN_REST = 3;
const QUALITY_CENTS = 15000; // €150
const QUALITY_MIN_ORDERS_PER_DAY = 100;
const SPEED_CENTS = 5000; // €50
const QUICK_WIN_CENTS = 10000; // €100
const QUICK_WIN_CAP_PER_PARTNER = 5;
const MENTOR_BRONZE_CENTS = 20000; // €200
const TEAM_BUILDER_CENTS = 50000; // €500
const TEAM_BUILDER_MIN_TEAM_REST = 15;
const MENTOR_MONTH_CENTS = 100000; // €1,000
const QUARTER_STREAK_CENTS = 150000; // €1,500
const SPEED_QUICK_WIN_DAYS = 14;
const MENTOR_BRONZE_SUB_REST_THRESHOLD = 5;
const QUALITY_LOOKBACK_DAYS = 180;

// ────────────────────────────────────────────────────────────
// Period helpers — Bucharest local month boundaries
// (same logic as partner-commission-calc)
// ────────────────────────────────────────────────────────────
function bucharestOffsetHoursFor(date: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'));
  const utc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
  );
  return Math.round((local - utc) / 3600000);
}

type Period = {
  periodStartDate: string; // YYYY-MM-01
  periodEndDate: string; // YYYY-MM-DD (last day)
  startUtc: string; // ISO
  endUtc: string; // ISO (exclusive)
  label: string; // YYYY-MM
  year: number;
  month0: number; // 0-indexed
};

function previousMonthBucharest(now: Date): { year: number; month: number } {
  const offset = bucharestOffsetHoursFor(now);
  const local = new Date(now.getTime() + offset * 3600000);
  let y = local.getUTCFullYear();
  let m = local.getUTCMonth();
  m -= 1;
  if (m < 0) { m = 11; y -= 1; }
  return { year: y, month: m };
}

function buildPeriod(year: number, month0: number): Period {
  const firstLocal = new Date(Date.UTC(year, month0, 1, 0, 0, 0));
  const firstOffset = bucharestOffsetHoursFor(firstLocal);
  const startUtc = new Date(firstLocal.getTime() - firstOffset * 3600000);

  let nextY = year;
  let nextM = month0 + 1;
  if (nextM > 11) { nextM = 0; nextY += 1; }
  const nextLocal = new Date(Date.UTC(nextY, nextM, 1, 0, 0, 0));
  const nextOffset = bucharestOffsetHoursFor(nextLocal);
  const endUtc = new Date(nextLocal.getTime() - nextOffset * 3600000);

  const lastDayLocal = new Date(Date.UTC(nextY, nextM, 0));
  const dd = String(lastDayLocal.getUTCDate()).padStart(2, '0');
  const mm = String(month0 + 1).padStart(2, '0');
  const periodStartDate = `${year}-${mm}-01`;
  const periodEndDate = `${year}-${mm}-${dd}`;

  return {
    periodStartDate,
    periodEndDate,
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
    label: `${year}-${mm}`,
    year,
    month0,
  };
}

function parsePeriodParam(s: string): { year: number; month0: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month1 = Number(m[2]);
  if (month1 < 1 || month1 > 12) return null;
  return { year, month0: month1 - 1 };
}

// Quarter-end months: Mar=2, Jun=5, Sep=8, Dec=11 (0-indexed)
function isQuarterEnd(month0: number): boolean {
  return month0 === 2 || month0 === 5 || month0 === 8 || month0 === 11;
}

// Returns the first day of the quarter containing month0, as YYYY-MM-01
function quarterStartDate(year: number, month0: number): string {
  const quarterStartMonth0 = month0 - 2; // e.g. March(2)→January(0)
  const mm = String(quarterStartMonth0 + 1).padStart(2, '0');
  return `${year}-${mm}-01`;
}

// Returns the three months of the quarter as YYYY-MM-01 date strings
function quarterMonthStarts(year: number, month0: number): string[] {
  const starts: string[] = [];
  for (let i = 0; i < 3; i++) {
    const m = month0 - 2 + i;
    const mm = String(m + 1).padStart(2, '0');
    starts.push(`${year}-${mm}-01`);
  }
  return starts;
}

// ────────────────────────────────────────────────────────────
// Data helpers
// ────────────────────────────────────────────────────────────

type ActivePartner = {
  id: string;
};

async function fetchActivePartners(supabase: SupabaseClient): Promise<ActivePartner[]> {
  const { data, error } = await supabase
    .from('partners')
    .select('id')
    .eq('status', 'ACTIVE');
  if (error) {
    console.error('[bonus-monthly-calc-v3] fetch partners error:', error.message);
    return [];
  }
  return (data ?? []) as ActivePartner[];
}

type PartnerReferral = {
  id: string;
  partner_id: string;
  tenant_id: string;
  referred_at: string;
  ended_at: string | null;
};

async function fetchReferralsForPartner(
  supabase: SupabaseClient,
  partnerId: string,
): Promise<PartnerReferral[]> {
  const { data, error } = await supabase
    .from('partner_referrals')
    .select('id, partner_id, tenant_id, referred_at, ended_at')
    .eq('partner_id', partnerId);
  if (error) {
    console.error(`[bonus-monthly-calc-v3] fetch referrals error partner=${partnerId}:`, error.message);
    return [];
  }
  return (data ?? []) as PartnerReferral[];
}

// Count orders for a tenant between two ISO timestamps (DELIVERED + PAID)
async function countOrders(
  supabase: SupabaseClient,
  tenantId: string,
  startUtc: string,
  endUtc: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('restaurant_orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .in('status', ['DELIVERED', 'PAID'])
    .gte('created_at', startUtc)
    .lt('created_at', endUtc);
  if (error) {
    console.error('[bonus-monthly-calc-v3] countOrders error:', error.message);
    return 0;
  }
  return count ?? 0;
}

// Get the first order timestamp for a tenant (to detect "restaurant went LIVE")
async function getFirstOrderTimestamp(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('restaurant_orders')
    .select('created_at')
    .eq('tenant_id', tenantId)
    .in('status', ['DELIVERED', 'PAID'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[bonus-monthly-calc-v3] getFirstOrderTimestamp error:', error.message);
    return null;
  }
  return (data as { created_at: string } | null)?.created_at ?? null;
}

// Get the first order timestamp for a tenant within a specific period
async function getFirstOrderInPeriod(
  supabase: SupabaseClient,
  tenantId: string,
  startUtc: string,
  endUtc: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('restaurant_orders')
    .select('created_at')
    .eq('tenant_id', tenantId)
    .in('status', ['DELIVERED', 'PAID'])
    .gte('created_at', startUtc)
    .lt('created_at', endUtc)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[bonus-monthly-calc-v3] getFirstOrderInPeriod error:', error.message);
    return null;
  }
  return (data as { created_at: string } | null)?.created_at ?? null;
}

async function countLifetimeQuickWins(
  supabase: SupabaseClient,
  partnerId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('partner_activity_bonuses')
    .select('id', { count: 'exact', head: true })
    .eq('partner_id', partnerId)
    .eq('bonus_type', 'QUICK_WIN');
  if (error) {
    console.error('[bonus-monthly-calc-v3] countLifetimeQuickWins error:', error.message);
    return 999; // safe: if we can't read, don't award
  }
  return count ?? 0;
}

// Insert an activity bonus row; ON CONFLICT DO NOTHING for idempotency
async function insertBonus(
  supabase: SupabaseClient,
  row: {
    partner_id: string;
    bonus_type: string;
    period_start: string | null;
    period_end: string | null;
    amount_cents: number;
    context?: Record<string, unknown>;
  },
): Promise<boolean> {
  const { error } = await supabase
    .from('partner_activity_bonuses')
    .insert({
      partner_id: row.partner_id,
      bonus_type: row.bonus_type,
      period_start: row.period_start,
      period_end: row.period_end,
      amount_cents: row.amount_cents,
      context: row.context ?? {},
    })
    .select();
  if (error) {
    // code 23505 = unique_violation → idempotent skip (expected on re-run)
    if (error.code === '23505') return false;
    console.error(`[bonus-monthly-calc-v3] insertBonus error type=${row.bonus_type} partner=${row.partner_id}:`, error.message);
    return false;
  }
  return true;
}

// Insert ladder milestone; ON CONFLICT DO NOTHING
async function insertLadderMilestone(
  supabase: SupabaseClient,
  row: {
    partner_id: string;
    tier_reached: string;
    restaurants_count_at_award: number;
    bonus_amount_cents: number;
    perks_text: string | null;
  },
): Promise<boolean> {
  const { error } = await supabase
    .from('ladder_milestones')
    .insert({
      partner_id: row.partner_id,
      tier_reached: row.tier_reached,
      restaurants_count_at_award: row.restaurants_count_at_award,
      bonus_amount_cents: row.bonus_amount_cents,
      perks_text: row.perks_text,
      status: 'PENDING',
    });
  if (error) {
    if (error.code === '23505') return false; // already awarded
    console.error(`[bonus-monthly-calc-v3] insertLadderMilestone error partner=${row.partner_id} tier=${row.tier_reached}:`, error.message);
    return false;
  }
  return true;
}

type LadderTier = {
  tier_reached: string;
  threshold_count: number;
  bonus_amount_cents: number;
  perks_text: string | null;
  rank_order: number;
};

async function fetchLadderTiers(supabase: SupabaseClient): Promise<LadderTier[]> {
  const { data, error } = await supabase
    .from('ladder_tiers')
    .select('tier_reached, threshold_count, bonus_amount_cents, perks_text, rank_order')
    .order('rank_order', { ascending: true });
  if (error) {
    console.error('[bonus-monthly-calc-v3] fetchLadderTiers error:', error.message);
    return [];
  }
  return (data ?? []) as LadderTier[];
}

async function fetchExistingLadderMilestones(
  supabase: SupabaseClient,
  partnerId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('ladder_milestones')
    .select('tier_reached')
    .eq('partner_id', partnerId);
  if (error) {
    console.error('[bonus-monthly-calc-v3] fetchExistingLadderMilestones error:', error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r: { tier_reached: string }) => r.tier_reached));
}

// Fetch sponsor relationships: sponsor_partner_id → [sub_partner_id, ...]
async function fetchSponsorMap(
  supabase: SupabaseClient,
): Promise<Map<string, string[]>> {
  const { data, error } = await supabase
    .from('partner_sponsors')
    .select('sponsor_partner_id, sub_partner_id');
  if (error) {
    console.error('[bonus-monthly-calc-v3] fetchSponsorMap error:', error.message);
    return new Map();
  }
  const map = new Map<string, string[]>();
  for (const row of (data ?? []) as { sponsor_partner_id: string; sub_partner_id: string }[]) {
    const arr = map.get(row.sponsor_partner_id) ?? [];
    arr.push(row.sub_partner_id);
    map.set(row.sponsor_partner_id, arr);
  }
  return map;
}

// Check if a MENTOR_BRONZE bonus already exists for this sponsor+sub pair
async function mentorBronzeExists(
  supabase: SupabaseClient,
  sponsorId: string,
  subPartnerId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('partner_activity_bonuses')
    .select('id')
    .eq('partner_id', sponsorId)
    .eq('bonus_type', 'MENTOR_BRONZE')
    .contains('context', { sub_partner_id: subPartnerId })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[bonus-monthly-calc-v3] mentorBronzeExists error:', error.message);
    return true; // safe default: don't double-award
  }
  return data !== null;
}

// ────────────────────────────────────────────────────────────
// Main computation per partner
// ────────────────────────────────────────────────────────────

type BonusSummary = {
  streak: number;
  quality: number;
  speed: number;
  quick_win: number;
  mentor_bronze: number;
  team_builder: number;
  ladder: number;
};

async function processPartner(
  supabase: SupabaseClient,
  partnerId: string,
  period: Period,
  ladderTiers: LadderTier[],
  dryRun: boolean,
): Promise<BonusSummary> {
  const summary: BonusSummary = {
    streak: 0, quality: 0, speed: 0, quick_win: 0,
    mentor_bronze: 0, team_builder: 0, ladder: 0,
  };

  const referrals = await fetchReferralsForPartner(supabase, partnerId);

  // ── 1. STREAK ─────────────────────────────────────────────
  const referredInPeriod = referrals.filter((r) => {
    const referredAt = new Date(r.referred_at).getTime();
    return referredAt >= new Date(period.startUtc).getTime()
        && referredAt < new Date(period.endUtc).getTime();
  });

  if (referredInPeriod.length >= STREAK_MIN_REST) {
    if (!dryRun) {
      const inserted = await insertBonus(supabase, {
        partner_id: partnerId,
        bonus_type: 'STREAK',
        period_start: period.periodStartDate,
        period_end: period.periodEndDate,
        amount_cents: STREAK_CENTS,
      });
      if (inserted) summary.streak += 1;
    } else {
      summary.streak += 1;
    }
  }

  // ── 2. QUALITY ────────────────────────────────────────────
  // Active referrals referred >180d before period_start
  const periodStartTs = new Date(period.startUtc).getTime();
  const qualifyingReferrals = referrals.filter((r) => {
    if (r.ended_at !== null) return false;
    const referredAtTs = new Date(r.referred_at).getTime();
    return referredAtTs < periodStartTs - QUALITY_LOOKBACK_DAYS * 24 * 3600 * 1000;
  });

  if (qualifyingReferrals.length > 0) {
    const lookbackStart = new Date(periodStartTs - QUALITY_LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
    let allQualify = true;
    for (const r of qualifyingReferrals) {
      const orderCount = await countOrders(supabase, r.tenant_id, lookbackStart, period.startUtc);
      const avgPerDay = orderCount / QUALITY_LOOKBACK_DAYS;
      if (avgPerDay < QUALITY_MIN_ORDERS_PER_DAY) {
        allQualify = false;
        break;
      }
    }
    if (allQualify) {
      if (!dryRun) {
        const inserted = await insertBonus(supabase, {
          partner_id: partnerId,
          bonus_type: 'QUALITY',
          period_start: period.periodStartDate,
          period_end: period.periodEndDate,
          amount_cents: QUALITY_CENTS,
        });
        if (inserted) summary.quality += 1;
      } else {
        summary.quality += 1;
      }
    }
  }

  // ── 3. SPEED + QUICK_WIN ──────────────────────────────────
  // For each referral whose first order falls within this period
  let lifetimeQuickWins = await countLifetimeQuickWins(supabase, partnerId);

  for (const r of referredInPeriod) {
    const firstOrderTs = await getFirstOrderInPeriod(supabase, r.tenant_id, period.startUtc, period.endUtc);
    if (!firstOrderTs) continue; // no orders yet this period

    const referredAtTs = new Date(r.referred_at).getTime();
    const firstOrderTime = new Date(firstOrderTs).getTime();
    const daysDiff = (firstOrderTime - referredAtTs) / (24 * 3600 * 1000);

    if (daysDiff <= SPEED_QUICK_WIN_DAYS) {
      // SPEED bonus
      if (!dryRun) {
        const inserted = await insertBonus(supabase, {
          partner_id: partnerId,
          bonus_type: 'SPEED',
          period_start: period.periodStartDate,
          period_end: period.periodEndDate,
          amount_cents: SPEED_CENTS,
          context: { referral_id: r.id, tenant_id: r.tenant_id },
        });
        if (inserted) summary.speed += 1;
      } else {
        summary.speed += 1;
      }

      // QUICK_WIN bonus — capped at 5 lifetime
      if (lifetimeQuickWins < QUICK_WIN_CAP_PER_PARTNER) {
        if (!dryRun) {
          const inserted = await insertBonus(supabase, {
            partner_id: partnerId,
            bonus_type: 'QUICK_WIN',
            period_start: period.periodStartDate,
            period_end: period.periodEndDate,
            amount_cents: QUICK_WIN_CENTS,
            context: { referral_id: r.id, tenant_id: r.tenant_id },
          });
          if (inserted) {
            summary.quick_win += 1;
            lifetimeQuickWins += 1;
          }
        } else {
          summary.quick_win += 1;
          lifetimeQuickWins += 1;
        }
      }
    }
  }

  // ── 8. LADDER ─────────────────────────────────────────────
  // Count active referrals (ended_at IS NULL)
  const activeReferralCount = referrals.filter((r) => r.ended_at === null).length;
  const existingMilestones = await fetchExistingLadderMilestones(supabase, partnerId);

  for (const tier of ladderTiers) {
    if (activeReferralCount >= tier.threshold_count && !existingMilestones.has(tier.tier_reached)) {
      if (!dryRun) {
        const inserted = await insertLadderMilestone(supabase, {
          partner_id: partnerId,
          tier_reached: tier.tier_reached,
          restaurants_count_at_award: activeReferralCount,
          bonus_amount_cents: tier.bonus_amount_cents,
          perks_text: tier.perks_text,
        });
        if (inserted) summary.ladder += 1;
      } else {
        summary.ladder += 1;
      }
    }
  }

  return summary;
}

// ────────────────────────────────────────────────────────────
// Sponsor-level bonuses (MENTOR_BRONZE, TEAM_BUILDER, MENTOR_MONTH)
// ────────────────────────────────────────────────────────────

type MentorScore = {
  sponsor_id: string;
  score: number;
};

async function processSponsorBonuses(
  supabase: SupabaseClient,
  sponsorMap: Map<string, string[]>,
  period: Period,
  // allReferralsByPartner: pre-fetched to avoid N+1 on referral fetches
  allReferralsByPartner: Map<string, PartnerReferral[]>,
  dryRun: boolean,
): Promise<{ mentor_bronze: number; team_builder: number; mentor_month: number }> {
  let totalMentorBronze = 0;
  let totalTeamBuilder = 0;
  let totalMentorMonth = 0;

  const mentorScores: MentorScore[] = [];

  for (const [sponsorId, subIds] of sponsorMap.entries()) {
    // ── 4. MENTOR_BRONZE ────────────────────────────────────
    // For each sub, count their total active referrals.
    // If sub crossed 5 in this period and no existing MENTOR_BRONZE for (sponsor, sub) → award.
    for (const subId of subIds) {
      const subReferrals = allReferralsByPartner.get(subId) ?? [];
      const activeCount = subReferrals.filter((r) => r.ended_at === null).length;

      if (activeCount >= MENTOR_BRONZE_SUB_REST_THRESHOLD) {
        // Check if the sub's 5th restaurant was referred in this period (crossed the threshold this period)
        const sortedActive = subReferrals
          .filter((r) => r.ended_at === null)
          .sort((a, b) => new Date(a.referred_at).getTime() - new Date(b.referred_at).getTime());

        const nthReferral = sortedActive[MENTOR_BRONZE_SUB_REST_THRESHOLD - 1];
        const crossedInPeriod = nthReferral
          && new Date(nthReferral.referred_at).getTime() >= new Date(period.startUtc).getTime()
          && new Date(nthReferral.referred_at).getTime() < new Date(period.endUtc).getTime();

        if (crossedInPeriod) {
          const alreadyAwarded = await mentorBronzeExists(supabase, sponsorId, subId);
          if (!alreadyAwarded) {
            if (!dryRun) {
              const inserted = await insertBonus(supabase, {
                partner_id: sponsorId,
                bonus_type: 'MENTOR_BRONZE',
                period_start: period.periodStartDate,
                period_end: period.periodEndDate,
                amount_cents: MENTOR_BRONZE_CENTS,
                context: { sub_partner_id: subId },
              });
              if (inserted) totalMentorBronze += 1;
            } else {
              totalMentorBronze += 1;
            }
          }
        }
      }
    }

    // ── 5. TEAM_BUILDER ─────────────────────────────────────
    // Sum partner_referrals brought in period by ALL sub-resellers
    let teamRestCount = 0;
    for (const subId of subIds) {
      const subReferrals = allReferralsByPartner.get(subId) ?? [];
      const inPeriod = subReferrals.filter((r) => {
        const ts = new Date(r.referred_at).getTime();
        return ts >= new Date(period.startUtc).getTime()
            && ts < new Date(period.endUtc).getTime();
      });
      teamRestCount += inPeriod.length;
    }

    if (teamRestCount >= TEAM_BUILDER_MIN_TEAM_REST) {
      if (!dryRun) {
        const inserted = await insertBonus(supabase, {
          partner_id: sponsorId,
          bonus_type: 'TEAM_BUILDER',
          period_start: period.periodStartDate,
          period_end: period.periodEndDate,
          amount_cents: TEAM_BUILDER_CENTS,
          context: { team_rest_count: teamRestCount },
        });
        if (inserted) totalTeamBuilder += 1;
      } else {
        totalTeamBuilder += 1;
      }

      // Accumulate score for MENTOR_MONTH election
      // score = TEAM_BUILDER thresholds reached * sub_count
      // (1 threshold reached if ≥15, we track exact count / threshold as multiplier)
      const thresholdsReached = Math.floor(teamRestCount / TEAM_BUILDER_MIN_TEAM_REST);
      mentorScores.push({ sponsor_id: sponsorId, score: thresholdsReached * subIds.length });
    }
  }

  // ── 6. MENTOR_MONTH ──────────────────────────────────────
  if (mentorScores.length > 0) {
    // Sort by score desc, then by sponsor_id asc (alphabetic tiebreak)
    mentorScores.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.sponsor_id.localeCompare(b.sponsor_id);
    });
    const winner = mentorScores[0];
    if (!dryRun) {
      const inserted = await insertBonus(supabase, {
        partner_id: winner.sponsor_id,
        bonus_type: 'MENTOR_MONTH',
        period_start: period.periodStartDate,
        period_end: period.periodEndDate,
        amount_cents: MENTOR_MONTH_CENTS,
        context: { score: winner.score },
      });
      if (inserted) totalMentorMonth += 1;
    } else {
      totalMentorMonth += 1;
    }
  }

  return {
    mentor_bronze: totalMentorBronze,
    team_builder: totalTeamBuilder,
    mentor_month: totalMentorMonth,
  };
}

// ── 7. QUARTER_STREAK ────────────────────────────────────────
async function processQuarterStreak(
  supabase: SupabaseClient,
  activePartners: ActivePartner[],
  period: Period,
  allReferralsByPartner: Map<string, PartnerReferral[]>,
  dryRun: boolean,
): Promise<number> {
  if (!isQuarterEnd(period.month0)) return 0;

  const qStart = quarterStartDate(period.year, period.month0);
  const monthStarts = quarterMonthStarts(period.year, period.month0);
  let awarded = 0;

  for (const partner of activePartners) {
    const referrals = allReferralsByPartner.get(partner.id) ?? [];

    // Build Bucharest UTC boundaries for each of the 3 months
    const allThreeMonthsQualify = monthStarts.every((mStart) => {
      const [y, m] = mStart.split('-').map(Number);
      const monthPeriod = buildPeriod(y, m - 1);
      const inMonth = referrals.filter((r) => {
        const ts = new Date(r.referred_at).getTime();
        return ts >= new Date(monthPeriod.startUtc).getTime()
            && ts < new Date(monthPeriod.endUtc).getTime();
      });
      return inMonth.length >= STREAK_MIN_REST;
    });

    if (allThreeMonthsQualify) {
      if (!dryRun) {
        const inserted = await insertBonus(supabase, {
          partner_id: partner.id,
          bonus_type: 'QUARTER_STREAK',
          period_start: qStart, // first day of quarter for idempotency
          period_end: period.periodEndDate,
          amount_cents: QUARTER_STREAK_CENTS,
          context: { quarter_months: monthStarts },
        });
        if (inserted) awarded += 1;
      } else {
        awarded += 1;
      }
    }
  }
  return awarded;
}

// ────────────────────────────────────────────────────────────
// HTTP entrypoint
// ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  return withRunLog('bonus-monthly-calc-v3', async ({ setMetadata }) => {
    const expected = Deno.env.get('HIR_NOTIFY_SECRET');
    if (!expected) return json(500, { error: 'secret_not_configured' });
    const got = req.headers.get('x-hir-notify-secret') ?? '';
    if (got.length !== expected.length) return json(401, { error: 'unauthorized' });
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
    if (diff !== 0) return json(401, { error: 'unauthorized' });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'supabase_env_missing' });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const url = new URL(req.url);
    const periodParam = url.searchParams.get('period');
    const dryRun = url.searchParams.get('dry_run') === 'true';

    let year: number;
    let month0: number;
    if (periodParam) {
      const parsed = parsePeriodParam(periodParam);
      if (!parsed) return json(400, { error: 'invalid_period_format', expected: 'YYYY-MM' });
      year = parsed.year;
      month0 = parsed.month0;
    } else {
      const prev = previousMonthBucharest(new Date());
      year = prev.year;
      month0 = prev.month;
    }

    const period = buildPeriod(year, month0);
    console.log(
      `[bonus-monthly-calc-v3] period=${period.label} startUtc=${period.startUtc} endUtc=${period.endUtc} dry_run=${dryRun}`,
    );

    const [activePartners, ladderTiers, sponsorMap] = await Promise.all([
      fetchActivePartners(supabase),
      fetchLadderTiers(supabase),
      fetchSponsorMap(supabase),
    ]);

    console.log(`[bonus-monthly-calc-v3] partners=${activePartners.length} ladder_tiers=${ladderTiers.length} sponsors=${sponsorMap.size}`);

    // Pre-fetch all referrals for all active partners in one pass to avoid N+1
    const allReferralsByPartner = new Map<string, PartnerReferral[]>();
    for (const partner of activePartners) {
      const referrals = await fetchReferralsForPartner(supabase, partner.id);
      allReferralsByPartner.set(partner.id, referrals);
    }
    // Also pre-fetch for sub-partners referenced in sponsor map (may not be in activePartners)
    for (const subIds of sponsorMap.values()) {
      for (const subId of subIds) {
        if (!allReferralsByPartner.has(subId)) {
          const referrals = await fetchReferralsForPartner(supabase, subId);
          allReferralsByPartner.set(subId, referrals);
        }
      }
    }

    let totalStreak = 0;
    let totalQuality = 0;
    let totalSpeed = 0;
    let totalQuickWin = 0;
    let totalLadder = 0;

    // Per-partner bonuses (streak, quality, speed, quick_win, ladder)
    for (const partner of activePartners) {
      try {
        const s = await processPartner(supabase, partner.id, period, ladderTiers, dryRun);
        totalStreak += s.streak;
        totalQuality += s.quality;
        totalSpeed += s.speed;
        totalQuickWin += s.quick_win;
        totalLadder += s.ladder;
      } catch (e) {
        console.error(`[bonus-monthly-calc-v3] partner error partner=${partner.id}:`, (e as Error).message);
      }
    }

    // Sponsor-level bonuses (mentor_bronze, team_builder, mentor_month)
    const { mentor_bronze, team_builder, mentor_month } = await processSponsorBonuses(
      supabase,
      sponsorMap,
      period,
      allReferralsByPartner,
      dryRun,
    );

    // Quarter streak (only in quarter-end months)
    const quarterStreakAwarded = await processQuarterStreak(
      supabase,
      activePartners,
      period,
      allReferralsByPartner,
      dryRun,
    );

    const summary = {
      ok: true,
      period: period.label,
      dry_run: dryRun,
      is_quarter_end: isQuarterEnd(period.month0),
      partners_processed: activePartners.length,
      streak: totalStreak,
      quality: totalQuality,
      speed: totalSpeed,
      quick_win: totalQuickWin,
      mentor_bronze,
      team_builder,
      mentor_month,
      quarter_streak: quarterStreakAwarded,
      ladder: totalLadder,
    };
    console.log('[bonus-monthly-calc-v3] summary', summary);
    setMetadata(summary as unknown as Record<string, string | number | boolean | null>);
    return json(200, summary);
  });
});
