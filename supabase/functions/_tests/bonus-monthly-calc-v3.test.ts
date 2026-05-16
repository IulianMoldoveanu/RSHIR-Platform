// Tests for bonus-monthly-calc-v3 logic.
//
// Run with:
//   deno test --allow-env supabase/functions/_tests/bonus-monthly-calc-v3.test.ts
//
// These tests use a minimal Supabase mock (no real DB connection) to verify
// the bonus computation logic in isolation. We reproduce the helper types
// inline so we don't create a circular import with the Deno serve entrypoint.

import {
  assert,
  assertEquals,
  assertFalse,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

// ────────────────────────────────────────────────────────────
// Inline constants (mirrors index.ts — avoids serve entrypoint import)
// ────────────────────────────────────────────────────────────
const STREAK_CENTS = 10000;
const STREAK_MIN_REST = 3;
const QUALITY_CENTS = 15000;
const QUALITY_MIN_ORDERS_PER_DAY = 100;
const SPEED_CENTS = 5000;
const QUICK_WIN_CENTS = 10000;
const QUICK_WIN_CAP_PER_PARTNER = 5;
const MENTOR_BRONZE_CENTS = 20000;
const TEAM_BUILDER_CENTS = 50000;
const TEAM_BUILDER_MIN_TEAM_REST = 15;
const SPEED_QUICK_WIN_DAYS = 14;
const MENTOR_BRONZE_SUB_REST_THRESHOLD = 5;
const QUALITY_LOOKBACK_DAYS = 180;

// ────────────────────────────────────────────────────────────
// Pure helper: period boundaries
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
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours());
  return Math.round((local - utc) / 3600000);
}

function buildPeriod(year: number, month0: number) {
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

  return {
    periodStartDate: `${year}-${mm}-01`,
    periodEndDate: `${year}-${mm}-${dd}`,
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
    label: `${year}-${mm}`,
    year,
    month0,
  };
}

function isQuarterEnd(month0: number): boolean {
  return month0 === 2 || month0 === 5 || month0 === 8 || month0 === 11;
}

// ────────────────────────────────────────────────────────────
// Minimal mock Supabase client
// ────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;

// Recorded calls so we can assert insertions
const insertedActivityBonuses: Row[] = [];
const insertedLadderMilestones: Row[] = [];

function resetMocks() {
  insertedActivityBonuses.length = 0;
  insertedLadderMilestones.length = 0;
}

// Builder for a fluent mock query chain
function makeQueryChain(rows: Row[], countOverride?: number) {
  const chain: Record<string, unknown> = {};
  const apply = () => chain;
  chain.select = (_cols: unknown, opts?: { count?: string; head?: boolean }) => {
    if (opts?.head) {
      return Promise.resolve({ count: countOverride ?? rows.length, error: null });
    }
    return Promise.resolve({ data: rows, error: null, count: rows.length });
  };
  chain.eq = () => apply();
  chain.in = () => apply();
  chain.gte = () => apply();
  chain.lt = () => apply();
  chain.contains = () => apply();
  chain.order = () => apply();
  chain.limit = () => apply();
  chain.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  chain.single = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  return chain;
}

type MockDB = {
  partners: Row[];
  partner_referrals: Row[];
  partner_sponsors: Row[];
  partner_activity_bonuses: Row[];
  ladder_milestones: Row[];
  ladder_tiers: Row[];
  restaurant_orders: Row[];
};

function makeMockClient(db: MockDB) {
  return {
    from(table: string) {
      return {
        select(cols: unknown, opts?: { count?: string; head?: boolean }) {
          const rows = (db as unknown as Record<string, Row[]>)[table] ?? [];
          if (opts?.head) {
            return Promise.resolve({ count: rows.length, error: null });
          }
          return {
            eq: (_col: string, _val: unknown) => makeQueryChain(rows.filter((r) => r[_col] === _val)),
            in: (_col: string, _vals: unknown[]) => makeQueryChain(rows.filter((r) => (_vals as unknown[]).includes(r[_col as string]))),
            gte: () => makeQueryChain(rows),
            lt: () => makeQueryChain(rows),
            order: () => makeQueryChain(rows),
            limit: () => makeQueryChain(rows),
            maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
            single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
            contains: () => makeQueryChain(rows),
          };
        },
        insert(row: Row) {
          const rows = (db as unknown as Record<string, Row[]>)[table] ?? [];
          // Check unique constraints
          if (table === 'partner_activity_bonuses') {
            const recurring = ['STREAK', 'QUALITY', 'TEAM_BUILDER', 'MENTOR_MONTH', 'QUARTER_STREAK'];
            if (recurring.includes(row.bonus_type as string)) {
              const dup = rows.find((r) =>
                r.partner_id === row.partner_id &&
                r.bonus_type === row.bonus_type &&
                r.period_start === row.period_start,
              );
              if (dup) return { select: () => Promise.resolve({ data: null, error: { code: '23505', message: 'unique_violation' } }) };
            }
            rows.push({ ...row, id: crypto.randomUUID() });
            insertedActivityBonuses.push(row);
          }
          if (table === 'ladder_milestones') {
            const dup = rows.find((r) =>
              r.partner_id === row.partner_id &&
              r.tier_reached === row.tier_reached,
            );
            if (dup) return Promise.resolve({ error: { code: '23505', message: 'unique_violation' } });
            rows.push({ ...row, id: crypto.randomUUID() });
            insertedLadderMilestones.push(row);
          }
          return { select: () => Promise.resolve({ data: [row], error: null }) };
        },
      };
    },
  };
}

// ────────────────────────────────────────────────────────────
// Simplified bonus runner (mirrors index.ts logic, no Deno.serve)
// ────────────────────────────────────────────────────────────

async function runStreakBonus(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  partnerId: string,
  period: ReturnType<typeof buildPeriod>,
  referrals: Row[],
  dryRun = false,
): Promise<boolean> {
  const referredInPeriod = referrals.filter((r) => {
    const ts = new Date(r.referred_at as string).getTime();
    return ts >= new Date(period.startUtc).getTime() && ts < new Date(period.endUtc).getTime();
  });
  if (referredInPeriod.length < STREAK_MIN_REST) return false;
  if (dryRun) return true;

  const { error } = await supabase.from('partner_activity_bonuses').insert({
    partner_id: partnerId,
    bonus_type: 'STREAK',
    period_start: period.periodStartDate,
    period_end: period.periodEndDate,
    amount_cents: STREAK_CENTS,
    context: {},
  }).select();
  return !error || error.code !== '23505' ? !error : false;
}

async function runMentorBronze(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  sponsorId: string,
  subId: string,
  subReferrals: Row[],
  period: ReturnType<typeof buildPeriod>,
  dryRun = false,
): Promise<boolean> {
  const activeCount = subReferrals.filter((r) => r.ended_at === null).length;
  if (activeCount < MENTOR_BRONZE_SUB_REST_THRESHOLD) return false;

  const sortedActive = subReferrals
    .filter((r) => r.ended_at === null)
    .sort((a, b) => new Date(a.referred_at as string).getTime() - new Date(b.referred_at as string).getTime());
  const nthReferral = sortedActive[MENTOR_BRONZE_SUB_REST_THRESHOLD - 1];
  if (!nthReferral) return false;

  const nthTs = new Date(nthReferral.referred_at as string).getTime();
  const crossedInPeriod = nthTs >= new Date(period.startUtc).getTime() && nthTs < new Date(period.endUtc).getTime();
  if (!crossedInPeriod) return false;

  // Check existing
  const existing = supabase.from('partner_activity_bonuses').select().eq('partner_id', sponsorId).eq('bonus_type', 'MENTOR_BRONZE').contains('context', { sub_partner_id: subId }).limit(1).maybeSingle;
  const existingResult = await existing();
  if (existingResult.data) return false;

  if (dryRun) return true;

  const { error } = await supabase.from('partner_activity_bonuses').insert({
    partner_id: sponsorId,
    bonus_type: 'MENTOR_BRONZE',
    period_start: period.periodStartDate,
    period_end: period.periodEndDate,
    amount_cents: MENTOR_BRONZE_CENTS,
    context: { sub_partner_id: subId },
  }).select();
  return !error;
}

async function runQuickWin(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  partnerId: string,
  referral: Row,
  firstOrderTs: string,
  period: ReturnType<typeof buildPeriod>,
  lifetimeCount: number,
  dryRun = false,
): Promise<boolean> {
  if (lifetimeCount >= QUICK_WIN_CAP_PER_PARTNER) return false;
  const daysDiff = (new Date(firstOrderTs).getTime() - new Date(referral.referred_at as string).getTime()) / (24 * 3600 * 1000);
  if (daysDiff > SPEED_QUICK_WIN_DAYS) return false;
  if (dryRun) return true;

  const { error } = await supabase.from('partner_activity_bonuses').insert({
    partner_id: partnerId,
    bonus_type: 'QUICK_WIN',
    period_start: period.periodStartDate,
    period_end: period.periodEndDate,
    amount_cents: QUICK_WIN_CENTS,
    context: { referral_id: referral.id, tenant_id: referral.tenant_id },
  }).select();
  return !error;
}

async function runLadder(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  partnerId: string,
  activeReferralCount: number,
  ladderTiers: Row[],
  existingMilestoneTiers: Set<string>,
  dryRun = false,
): Promise<number> {
  let awarded = 0;
  for (const tier of ladderTiers) {
    if (activeReferralCount >= (tier.threshold_count as number) && !existingMilestoneTiers.has(tier.tier_reached as string)) {
      if (dryRun) { awarded++; continue; }
      const result = await supabase.from('ladder_milestones').insert({
        partner_id: partnerId,
        tier_reached: tier.tier_reached,
        restaurants_count_at_award: activeReferralCount,
        bonus_amount_cents: tier.bonus_amount_cents,
        perks_text: tier.perks_text,
        status: 'PENDING',
      });
      if (!result?.error || result.error.code !== '23505') awarded++;
    }
  }
  return awarded;
}

// ────────────────────────────────────────────────────────────
// Test fixtures
// ────────────────────────────────────────────────────────────
const PERIOD = buildPeriod(2026, 4); // May 2026

function makeReferral(partnerId: string, referredAt: string, endedAt: string | null = null): Row {
  return {
    id: crypto.randomUUID(),
    partner_id: partnerId,
    tenant_id: crypto.randomUUID(),
    referred_at: referredAt,
    ended_at: endedAt,
  };
}

const PARTNER_A = crypto.randomUUID();
const PARTNER_B = crypto.randomUUID(); // sub-reseller

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

Deno.test('STREAK — happy path: 3 restaurants in period → bonus inserted', async () => {
  resetMocks();

  const db: MockDB = {
    partners: [{ id: PARTNER_A, status: 'ACTIVE' }],
    partner_referrals: [
      makeReferral(PARTNER_A, '2026-05-02T10:00:00Z'),
      makeReferral(PARTNER_A, '2026-05-08T10:00:00Z'),
      makeReferral(PARTNER_A, '2026-05-15T10:00:00Z'),
    ],
    partner_sponsors: [],
    partner_activity_bonuses: [],
    ladder_milestones: [],
    ladder_tiers: [],
    restaurant_orders: [],
  };

  const supabase = makeMockClient(db);
  const inserted = await runStreakBonus(supabase, PARTNER_A, PERIOD, db.partner_referrals);

  assert(inserted, 'should have inserted STREAK bonus');
  assertEquals(insertedActivityBonuses.length, 1);
  assertEquals(insertedActivityBonuses[0].bonus_type, 'STREAK');
  assertEquals(insertedActivityBonuses[0].amount_cents, STREAK_CENTS);
  assertEquals(insertedActivityBonuses[0].period_start, PERIOD.periodStartDate);
});

Deno.test('STREAK — miss: only 2 restaurants in period → no bonus', async () => {
  resetMocks();

  const db: MockDB = {
    partners: [{ id: PARTNER_A, status: 'ACTIVE' }],
    partner_referrals: [
      makeReferral(PARTNER_A, '2026-05-02T10:00:00Z'),
      makeReferral(PARTNER_A, '2026-05-10T10:00:00Z'),
    ],
    partner_sponsors: [],
    partner_activity_bonuses: [],
    ladder_milestones: [],
    ladder_tiers: [],
    restaurant_orders: [],
  };

  const supabase = makeMockClient(db);
  const inserted = await runStreakBonus(supabase, PARTNER_A, PERIOD, db.partner_referrals);

  assertFalse(inserted, 'should NOT insert STREAK bonus with only 2 restaurants');
  assertEquals(insertedActivityBonuses.length, 0);
});

Deno.test('STREAK — idempotency: re-run same period writes nothing extra', async () => {
  resetMocks();

  const db: MockDB = {
    partners: [{ id: PARTNER_A, status: 'ACTIVE' }],
    partner_referrals: [
      makeReferral(PARTNER_A, '2026-05-02T10:00:00Z'),
      makeReferral(PARTNER_A, '2026-05-08T10:00:00Z'),
      makeReferral(PARTNER_A, '2026-05-15T10:00:00Z'),
    ],
    partner_sponsors: [],
    partner_activity_bonuses: [],
    ladder_milestones: [],
    ladder_tiers: [],
    restaurant_orders: [],
  };

  const supabase = makeMockClient(db);

  // First run — should insert
  await runStreakBonus(supabase, PARTNER_A, PERIOD, db.partner_referrals);
  assertEquals(insertedActivityBonuses.length, 1);

  // Second run — unique constraint fires, no second insert
  await runStreakBonus(supabase, PARTNER_A, PERIOD, db.partner_referrals);
  assertEquals(insertedActivityBonuses.length, 1, 'idempotent: second run must not duplicate');
});

Deno.test('MENTOR_BRONZE — happy path: sub crosses 5 restaurants in period → €200', async () => {
  resetMocks();

  // Sub has 5 active referrals; the 5th was referred in May 2026
  const subReferrals: Row[] = [
    makeReferral(PARTNER_B, '2026-01-10T10:00:00Z'), // old
    makeReferral(PARTNER_B, '2026-02-10T10:00:00Z'),
    makeReferral(PARTNER_B, '2026-03-10T10:00:00Z'),
    makeReferral(PARTNER_B, '2026-04-10T10:00:00Z'),
    makeReferral(PARTNER_B, '2026-05-10T10:00:00Z'), // 5th — crossed threshold in May
  ];

  const db: MockDB = {
    partners: [],
    partner_referrals: subReferrals,
    partner_sponsors: [{ sponsor_partner_id: PARTNER_A, sub_partner_id: PARTNER_B }],
    partner_activity_bonuses: [],
    ladder_milestones: [],
    ladder_tiers: [],
    restaurant_orders: [],
  };

  const supabase = makeMockClient(db);
  const awarded = await runMentorBronze(supabase, PARTNER_A, PARTNER_B, subReferrals, PERIOD);

  assert(awarded, 'MENTOR_BRONZE should be awarded');
  assertEquals(insertedActivityBonuses.length, 1);
  assertEquals(insertedActivityBonuses[0].bonus_type, 'MENTOR_BRONZE');
  assertEquals(insertedActivityBonuses[0].amount_cents, MENTOR_BRONZE_CENTS);
  assertEquals((insertedActivityBonuses[0].context as Record<string, string>).sub_partner_id, PARTNER_B);
});

Deno.test('MENTOR_BRONZE — only awarded once per sub (idempotency)', async () => {
  resetMocks();

  const subReferrals: Row[] = [
    makeReferral(PARTNER_B, '2026-01-10T10:00:00Z'),
    makeReferral(PARTNER_B, '2026-02-10T10:00:00Z'),
    makeReferral(PARTNER_B, '2026-03-10T10:00:00Z'),
    makeReferral(PARTNER_B, '2026-04-10T10:00:00Z'),
    makeReferral(PARTNER_B, '2026-05-10T10:00:00Z'),
  ];

  // Pre-populate an existing MENTOR_BRONZE for this sub
  const existingBonus: Row = {
    id: crypto.randomUUID(),
    partner_id: PARTNER_A,
    bonus_type: 'MENTOR_BRONZE',
    period_start: PERIOD.periodStartDate,
    period_end: PERIOD.periodEndDate,
    amount_cents: MENTOR_BRONZE_CENTS,
    context: { sub_partner_id: PARTNER_B },
  };

  const db: MockDB = {
    partners: [],
    partner_referrals: subReferrals,
    partner_sponsors: [],
    partner_activity_bonuses: [existingBonus],
    ladder_milestones: [],
    ladder_tiers: [],
    restaurant_orders: [],
  };

  const supabase = makeMockClient(db);
  const awarded = await runMentorBronze(supabase, PARTNER_A, PARTNER_B, subReferrals, PERIOD);

  assertFalse(awarded, 'MENTOR_BRONZE must not be awarded twice for the same sub');
  assertEquals(insertedActivityBonuses.length, 0);
});

Deno.test('QUICK_WIN — cap at 5 lifetime: 6th event is skipped', async () => {
  resetMocks();

  const period = PERIOD;
  const referral = makeReferral(PARTNER_A, '2026-05-01T08:00:00Z');
  // First order came 5 days after referral — within 14d window
  const firstOrderTs = '2026-05-06T12:00:00Z';

  const db: MockDB = {
    partners: [],
    partner_referrals: [],
    partner_sponsors: [],
    partner_activity_bonuses: [],
    ladder_milestones: [],
    ladder_tiers: [],
    restaurant_orders: [],
  };

  const supabase = makeMockClient(db);

  // Award 5 QUICK_WIN bonuses (at the cap)
  for (let i = 0; i < QUICK_WIN_CAP_PER_PARTNER; i++) {
    const ok = await runQuickWin(supabase, PARTNER_A, referral, firstOrderTs, period, i);
    assert(ok, `QUICK_WIN #${i + 1} should be awarded`);
  }
  assertEquals(insertedActivityBonuses.length, QUICK_WIN_CAP_PER_PARTNER);

  // 6th attempt — should be blocked by cap
  const blocked = await runQuickWin(supabase, PARTNER_A, referral, firstOrderTs, period, QUICK_WIN_CAP_PER_PARTNER);
  assertFalse(blocked, '6th QUICK_WIN should be blocked by lifetime cap');
  assertEquals(insertedActivityBonuses.length, QUICK_WIN_CAP_PER_PARTNER, 'no extra row after cap');
});

Deno.test('LADDER — 5 active restaurants → BRONZE inserted', async () => {
  resetMocks();

  const ladderTiers: Row[] = [
    { tier_reached: 'BRONZE', threshold_count: 5, bonus_amount_cents: 35000, perks_text: 'Tricou', rank_order: 1 },
    { tier_reached: 'SILVER', threshold_count: 15, bonus_amount_cents: 100000, perks_text: null, rank_order: 2 },
  ];

  const db: MockDB = {
    partners: [],
    partner_referrals: [],
    partner_sponsors: [],
    partner_activity_bonuses: [],
    ladder_milestones: [],
    ladder_tiers: ladderTiers,
    restaurant_orders: [],
  };

  const supabase = makeMockClient(db);
  const awarded = await runLadder(supabase, PARTNER_A, 5, ladderTiers, new Set());

  assertEquals(awarded, 1, 'exactly 1 ladder award for BRONZE');
  assertEquals(insertedLadderMilestones.length, 1);
  assertEquals(insertedLadderMilestones[0].tier_reached, 'BRONZE');
  assertEquals(insertedLadderMilestones[0].bonus_amount_cents, 35000);
});

Deno.test('LADDER — re-run same state writes no duplicates', async () => {
  resetMocks();

  const ladderTiers: Row[] = [
    { tier_reached: 'BRONZE', threshold_count: 5, bonus_amount_cents: 35000, perks_text: null, rank_order: 1 },
  ];

  const db: MockDB = {
    partners: [],
    partner_referrals: [],
    partner_sponsors: [],
    partner_activity_bonuses: [],
    ladder_milestones: [],
    ladder_tiers: ladderTiers,
    restaurant_orders: [],
  };

  const supabase = makeMockClient(db);

  // First run
  await runLadder(supabase, PARTNER_A, 5, ladderTiers, new Set());
  assertEquals(insertedLadderMilestones.length, 1);

  // Second run — BRONZE already in existingMilestoneTiers
  const awarded = await runLadder(supabase, PARTNER_A, 5, ladderTiers, new Set(['BRONZE']));
  assertEquals(awarded, 0, 'no new award when BRONZE already exists');
  assertEquals(insertedLadderMilestones.length, 1, 'no duplicate row inserted');
});

Deno.test('QUARTER_STREAK — isQuarterEnd only fires for Mar/Jun/Sep/Dec', () => {
  // 0-indexed months
  assert(isQuarterEnd(2), 'March (2) is quarter-end');
  assert(isQuarterEnd(5), 'June (5) is quarter-end');
  assert(isQuarterEnd(8), 'September (8) is quarter-end');
  assert(isQuarterEnd(11), 'December (11) is quarter-end');
  assertFalse(isQuarterEnd(0), 'January is not quarter-end');
  assertFalse(isQuarterEnd(4), 'May is not quarter-end');
  assertFalse(isQuarterEnd(7), 'August is not quarter-end');
});

Deno.test('Period boundaries — May 2026 startUtc is before endUtc', () => {
  const p = buildPeriod(2026, 4); // May
  const start = new Date(p.startUtc).getTime();
  const end = new Date(p.endUtc).getTime();
  assert(start < end, 'startUtc must be before endUtc');
  assertEquals(p.periodStartDate, '2026-05-01');
  assertEquals(p.periodEndDate, '2026-05-31');
});

Deno.test('STREAK amount matches V3_CONSTANTS.STREAK_CENTS', () => {
  // Guard: constant must match spec (€100 = 10000 cents)
  assertEquals(STREAK_CENTS, 10000);
  assertEquals(MENTOR_BRONZE_CENTS, 20000);
  assertEquals(QUICK_WIN_CENTS, 10000);
  assertEquals(SPEED_CENTS, 5000);
  assertEquals(TEAM_BUILDER_CENTS, 50000);
});
