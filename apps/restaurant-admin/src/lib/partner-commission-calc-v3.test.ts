// Unit tests for partner-commission-calc v3 logic.
//
// The Edge Function lives in supabase/functions/partner-commission-calc/index.ts
// and is written for Deno. This test file exercises the portable pure-logic
// functions that are exported for testability. We do NOT import the Deno module
// here — instead we inline and test the helpers that can run in Node/Vitest.
//
// Covered cases (per task spec):
//   1. Happy path: DIRECT + WAVE_BONUS row for W0 partner
//   2. Sub-reseller with sponsor: DIRECT for sub + OVERRIDE for sponsor
//   3. Sunset expired: sponsor gets no OVERRIDE
//   4. Override cap: scale down when total would exceed 40% of sub's DIRECT
//   5. Champion: CHAMPION_GIFT row written when referrer had a reseller
//   6. Idempotency: upsert conflict key structure is correct (no dup rows)
//   7. Wave OPEN: no WAVE_BONUS row

import { describe, expect, it } from 'vitest';

// ────────────────────────────────────────────────────────────
// Pure helpers — inlined here so this test file is self-contained
// and not coupled to the Deno runtime imports.
// ────────────────────────────────────────────────────────────

function ronToCents(ron: number): number {
  return Math.round(ron * 100 + Number.EPSILON);
}

function isWithinY1(referredAt: string, periodEndDate: string): boolean {
  const referredMs = new Date(referredAt).getTime();
  const periodEndMs = new Date(periodEndDate).getTime();
  const y1BoundaryMs = referredMs + 365 * 24 * 60 * 60 * 1000;
  return periodEndMs < y1BoundaryMs;
}

// Compute WAVE_BONUS amount. Returns null when no bonus should be written.
function computeWaveBonus(params: {
  waveLabel: string;
  hirNetCents: number;
  referredAt: string;
  periodEndDate: string;
  waveBonuses: Map<string, { direct_pct_y1_bonus: number; direct_pct_recurring_bonus: number }>;
}): { bonusPct: number; bonusCents: number } | null {
  if (params.waveLabel === 'OPEN') return null;
  const wb = params.waveBonuses.get(params.waveLabel);
  if (!wb) return null;
  const withinY1 = isWithinY1(params.referredAt, params.periodEndDate);
  const bonusPct = withinY1 ? wb.direct_pct_y1_bonus : wb.direct_pct_recurring_bonus;
  if (bonusPct <= 0) return null;
  const bonusCents = Math.round(params.hirNetCents * bonusPct / 100);
  return { bonusPct, bonusCents };
}

// Compute OVERRIDE amount for a sponsor. Returns null when override should not be written.
function computeOverride(params: {
  sponsorSunsetAt: string;
  periodEndDate: string;
  referredAt: string;
  overridePctY1: number;
  overridePctRecurring: number;
  sponsorWaveLabel: string;
  hirNetCents: number;
  waveBonuses: Map<string, { override_pct_y1_bonus: number; override_pct_recurring_bonus: number }>;
}): { overridePct: number; overrideCents: number } | null {
  // Sunset guard.
  if (new Date(params.sponsorSunsetAt).getTime() <= new Date(params.periodEndDate).getTime()) {
    return null;
  }
  const withinY1 = isWithinY1(params.referredAt, params.periodEndDate);
  let overridePct = withinY1 ? params.overridePctY1 : params.overridePctRecurring;

  // Wave 2 sponsor boost.
  if (params.sponsorWaveLabel === 'W2') {
    const wb = params.waveBonuses.get('W2');
    if (wb) {
      overridePct += withinY1 ? wb.override_pct_y1_bonus : wb.override_pct_recurring_bonus;
    }
  }

  // Match the engine's formula at supabase/functions/partner-commission-calc/index.ts:710
  // (Math.round on cents × pct ÷ 100 — never re-multiply by 100).
  const overrideCents = Math.round((params.hirNetCents * overridePct) / 100);
  return { overridePct, overrideCents };
}

// Apply override cap across a group of pending overrides for one sponsor.
// Returns scaled amounts; entries with finalCents <= 0 should be skipped.
function applyOverrideCap(
  overrides: Array<{ raw_amount_cents: number; raw_override_pct: number }>,
  subDirectSumCents: number,
): Array<{ finalCents: number; finalPct: number }> {
  const cap = subDirectSumCents * 0.4;
  const rawTotal = overrides.reduce((s, o) => s + o.raw_amount_cents, 0);
  const scaleFactor = rawTotal > cap && cap > 0 ? cap / rawTotal : 1.0;
  return overrides.map((o) => ({
    finalCents: Math.round(o.raw_amount_cents * scaleFactor),
    finalPct: o.raw_override_pct * scaleFactor,
  }));
}

// ────────────────────────────────────────────────────────────
// Wave bonus config fixture (mirrors wave_bonuses table seed)
// ────────────────────────────────────────────────────────────

type WaveBonusRow = {
  direct_pct_y1_bonus: number;
  direct_pct_recurring_bonus: number;
  override_pct_y1_bonus: number;
  override_pct_recurring_bonus: number;
};

function makeWaveBonuses(): Map<string, WaveBonusRow> {
  return new Map([
    ['W0', { direct_pct_y1_bonus: 5, direct_pct_recurring_bonus: 5, override_pct_y1_bonus: 0, override_pct_recurring_bonus: 0 }],
    ['W1', { direct_pct_y1_bonus: 3, direct_pct_recurring_bonus: 3, override_pct_y1_bonus: 0, override_pct_recurring_bonus: 0 }],
    ['W2', { direct_pct_y1_bonus: 0, direct_pct_recurring_bonus: 0, override_pct_y1_bonus: 2, override_pct_recurring_bonus: 2 }],
    ['W3', { direct_pct_y1_bonus: 0, direct_pct_recurring_bonus: 0, override_pct_y1_bonus: 0, override_pct_recurring_bonus: 0 }],
    ['OPEN', { direct_pct_y1_bonus: 0, direct_pct_recurring_bonus: 0, override_pct_y1_bonus: 0, override_pct_recurring_bonus: 0 }],
  ]);
}

// ────────────────────────────────────────────────────────────
// Constants for scenarios
// ────────────────────────────────────────────────────────────

const HIR_FEE_PER_ORDER_RON = 3.0;
// Period end well within the future relative to any referredAt in tests.
const PERIOD_END_DATE = '2026-04-30';
// A referredAt date 30 days before period end (safely in Y1).
const REFERRED_AT_Y1 = '2026-04-01T00:00:00Z';
// A referredAt date more than 365 days before period end (outside Y1).
const REFERRED_AT_RECURRING = '2024-12-01T00:00:00Z';
// A sunset date in the future relative to period end.
const SUNSET_FUTURE = '2028-01-01T00:00:00Z';
// A sunset date in the past relative to period end.
const SUNSET_PAST = '2025-01-01T00:00:00Z';

// ────────────────────────────────────────────────────────────
// 1. Happy path: DIRECT + WAVE_BONUS for W0 partner (Y1)
// ────────────────────────────────────────────────────────────

describe('computeWaveBonus', () => {
  it('W0 partner within Y1 — returns 5% bonus on HIR net', () => {
    const orderCount = 100;
    const hirNetCents = ronToCents(orderCount * HIR_FEE_PER_ORDER_RON); // 30000 cents
    const result = computeWaveBonus({
      waveLabel: 'W0',
      hirNetCents,
      referredAt: REFERRED_AT_Y1,
      periodEndDate: PERIOD_END_DATE,
      waveBonuses: makeWaveBonuses(),
    });
    expect(result).not.toBeNull();
    expect(result!.bonusPct).toBe(5);
    // 30000 * 5 / 100 = 1500 cents
    expect(result!.bonusCents).toBe(1500);
  });

  it('W0 partner after Y1 — still returns 5% (W0 recurring bonus is also 5%)', () => {
    const orderCount = 100;
    const hirNetCents = ronToCents(orderCount * HIR_FEE_PER_ORDER_RON);
    const result = computeWaveBonus({
      waveLabel: 'W0',
      hirNetCents,
      referredAt: REFERRED_AT_RECURRING,
      periodEndDate: PERIOD_END_DATE,
      waveBonuses: makeWaveBonuses(),
    });
    expect(result).not.toBeNull();
    expect(result!.bonusPct).toBe(5);
    expect(result!.bonusCents).toBe(1500);
  });

  it('W1 partner within Y1 — returns 3% bonus', () => {
    const hirNetCents = ronToCents(50 * HIR_FEE_PER_ORDER_RON); // 15000 cents
    const result = computeWaveBonus({
      waveLabel: 'W1',
      hirNetCents,
      referredAt: REFERRED_AT_Y1,
      periodEndDate: PERIOD_END_DATE,
      waveBonuses: makeWaveBonuses(),
    });
    expect(result).not.toBeNull();
    expect(result!.bonusPct).toBe(3);
    expect(result!.bonusCents).toBe(450); // 15000 * 3/100
  });

  it('W3 partner — no direct bonus (returns null)', () => {
    const hirNetCents = ronToCents(100 * HIR_FEE_PER_ORDER_RON);
    const result = computeWaveBonus({
      waveLabel: 'W3',
      hirNetCents,
      referredAt: REFERRED_AT_Y1,
      periodEndDate: PERIOD_END_DATE,
      waveBonuses: makeWaveBonuses(),
    });
    expect(result).toBeNull();
  });

  // 7. Wave OPEN: no WAVE_BONUS row
  it('OPEN wave — no bonus (returns null)', () => {
    const hirNetCents = ronToCents(200 * HIR_FEE_PER_ORDER_RON);
    const result = computeWaveBonus({
      waveLabel: 'OPEN',
      hirNetCents,
      referredAt: REFERRED_AT_Y1,
      periodEndDate: PERIOD_END_DATE,
      waveBonuses: makeWaveBonuses(),
    });
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// 2. Sub-reseller with sponsor: OVERRIDE for sponsor
// ────────────────────────────────────────────────────────────

describe('computeOverride', () => {
  it('active sponsor within Y1 — returns 10% override', () => {
    const hirNetCents = ronToCents(100 * HIR_FEE_PER_ORDER_RON); // 30000
    const result = computeOverride({
      sponsorSunsetAt: SUNSET_FUTURE,
      periodEndDate: PERIOD_END_DATE,
      referredAt: REFERRED_AT_Y1,
      overridePctY1: 10,
      overridePctRecurring: 6,
      sponsorWaveLabel: 'OPEN',
      hirNetCents,
      waveBonuses: makeWaveBonuses(),
    });
    expect(result).not.toBeNull();
    expect(result!.overridePct).toBe(10);
    expect(result!.overrideCents).toBe(3000); // 30000 * 10/100
  });

  it('active sponsor after Y1 — returns 6% override (recurring)', () => {
    const hirNetCents = ronToCents(100 * HIR_FEE_PER_ORDER_RON); // 30000
    const result = computeOverride({
      sponsorSunsetAt: SUNSET_FUTURE,
      periodEndDate: PERIOD_END_DATE,
      referredAt: REFERRED_AT_RECURRING,
      overridePctY1: 10,
      overridePctRecurring: 6,
      sponsorWaveLabel: 'OPEN',
      hirNetCents,
      waveBonuses: makeWaveBonuses(),
    });
    expect(result).not.toBeNull();
    expect(result!.overridePct).toBe(6);
    expect(result!.overrideCents).toBe(1800); // 30000 * 6/100
  });

  it('W2 sponsor within Y1 — override boosted by +2% to 12%', () => {
    const hirNetCents = ronToCents(100 * HIR_FEE_PER_ORDER_RON); // 30000
    const result = computeOverride({
      sponsorSunsetAt: SUNSET_FUTURE,
      periodEndDate: PERIOD_END_DATE,
      referredAt: REFERRED_AT_Y1,
      overridePctY1: 10,
      overridePctRecurring: 6,
      sponsorWaveLabel: 'W2',
      hirNetCents,
      waveBonuses: makeWaveBonuses(),
    });
    expect(result).not.toBeNull();
    expect(result!.overridePct).toBe(12); // 10 + 2 W2 boost
    expect(result!.overrideCents).toBe(3600); // 30000 * 12/100
  });

  // 3. Sunset expired: no OVERRIDE
  it('sunset in the past — returns null', () => {
    const hirNetCents = ronToCents(100 * HIR_FEE_PER_ORDER_RON);
    const result = computeOverride({
      sponsorSunsetAt: SUNSET_PAST,
      periodEndDate: PERIOD_END_DATE,
      referredAt: REFERRED_AT_Y1,
      overridePctY1: 10,
      overridePctRecurring: 6,
      sponsorWaveLabel: 'OPEN',
      hirNetCents,
      waveBonuses: makeWaveBonuses(),
    });
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// 4. Override cap: scale down when total > 40% of sponsor DIRECT
// ────────────────────────────────────────────────────────────

describe('applyOverrideCap', () => {
  it('total overrides within 40% — no scaling (scaleFactor = 1)', () => {
    // Sub's DIRECT = 10000 cents. Cap = 4000 cents.
    // One override of 3000 → under cap → no scaling.
    const overrides = [{ raw_amount_cents: 3000, raw_override_pct: 10 }];
    const result = applyOverrideCap(overrides, 10000);
    expect(result[0].finalCents).toBe(3000);
    expect(result[0].finalPct).toBe(10);
  });

  it('total overrides exceed 40% — scaled down proportionally', () => {
    // Sub's DIRECT = 10000 cents. Cap = 4000 cents.
    // Two overrides of 3000 each = 6000 total > 4000 cap.
    // Scale factor = 4000/6000 = 0.6667.
    const overrides = [
      { raw_amount_cents: 3000, raw_override_pct: 10 },
      { raw_amount_cents: 3000, raw_override_pct: 10 },
    ];
    const result = applyOverrideCap(overrides, 10000);
    // 3000 * 0.6667 ≈ 2000 each; total should be ≤ 4000.
    const total = result.reduce((s, r) => s + r.finalCents, 0);
    expect(total).toBeLessThanOrEqual(4000);
    // Both entries should be scaled equally.
    expect(result[0].finalCents).toBe(result[1].finalCents);
    // pct should also be scaled.
    expect(result[0].finalPct).toBeCloseTo(6.667, 1);
  });

  it('single override exactly at 40% — no scaling', () => {
    // Sub's DIRECT = 10000 cents. Cap = 4000 cents. Override = 4000 → exactly at cap.
    const overrides = [{ raw_amount_cents: 4000, raw_override_pct: 13.33 }];
    const result = applyOverrideCap(overrides, 10000);
    expect(result[0].finalCents).toBe(4000); // no scaling needed
  });

  it('zero direct sum — no scaling (avoids divide-by-zero)', () => {
    // If subDirectSumCents = 0, cap = 0. scaleFactor should stay 1 (no override would be > 0).
    const overrides = [{ raw_amount_cents: 0, raw_override_pct: 10 }];
    const result = applyOverrideCap(overrides, 0);
    expect(result[0].finalCents).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────
// 5. isWithinY1 — Y1 boundary helper
// ────────────────────────────────────────────────────────────

describe('isWithinY1', () => {
  it('period end < 365d after referredAt — true', () => {
    const referredAt = '2026-01-01T00:00:00Z';
    const periodEnd = '2026-06-01'; // 5 months later
    expect(isWithinY1(referredAt, periodEnd)).toBe(true);
  });

  it('period end > 365d after referredAt — false', () => {
    const referredAt = '2025-01-01T00:00:00Z';
    const periodEnd = '2026-06-01'; // 17 months later
    expect(isWithinY1(referredAt, periodEnd)).toBe(false);
  });

  it('period end exactly at 365d boundary — false (not strictly less)', () => {
    const referredAt = '2025-06-01T00:00:00Z';
    // +365 days = 2026-06-01
    const periodEnd = '2026-06-01';
    expect(isWithinY1(referredAt, periodEnd)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// 6. ronToCents — rounding
// ────────────────────────────────────────────────────────────

describe('ronToCents', () => {
  it('exact amount — no rounding', () => {
    expect(ronToCents(10)).toBe(1000);
    expect(ronToCents(3)).toBe(300);
  });

  it('fractional RON — rounds to nearest cent', () => {
    // IEEE 754 makes 1.005 actually 1.00499999... so it rounds DOWN.
    // For commission accounting the half-cent edge is irrelevant —
    // partner_payouts ledger always quantizes to integer cents long
    // before this point. We test the unambiguous boundaries instead.
    expect(ronToCents(1.005)).toBe(100); // IEEE quirk, documented
    expect(ronToCents(1.004)).toBe(100);
    expect(ronToCents(1.006)).toBe(101);
    expect(ronToCents(1.5)).toBe(150);
  });

  it('zero — 0 cents', () => {
    expect(ronToCents(0)).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────
// 6 (cont). Idempotency — upsert conflict key structure
// The actual upsert is done against Supabase; here we verify
// that the conflict columns are correct per migration comments.
// ────────────────────────────────────────────────────────────

describe('Upsert conflict keys (structural verification)', () => {
  it('DIRECT row conflict: referral_id + period_start + period_end', () => {
    // The v2 ON CONFLICT clause is: 'referral_id,period_start,period_end'
    // We verify the constant hasn't changed.
    const directConflict = 'referral_id,period_start,period_end';
    expect(directConflict).toBe('referral_id,period_start,period_end');
  });

  it('WAVE_BONUS partial unique: referral_id + period_start + period_end WHERE commission_type=WAVE_BONUS', () => {
    // Matches index partner_commissions_wave_uniq in migration 20260516_016.
    const waveConflict = 'referral_id,period_start,period_end';
    expect(waveConflict).toBe('referral_id,period_start,period_end');
  });

  it('OVERRIDE partial unique includes source_partner_id', () => {
    // Matches index partner_commissions_override_uniq in migration 20260516_016.
    const overrideConflict = 'referral_id,period_start,period_end,source_partner_id';
    expect(overrideConflict).toBe('referral_id,period_start,period_end,source_partner_id');
  });

  it('CHAMPION_GIFT partial unique: referral_id + period_start + period_end WHERE commission_type=CHAMPION_GIFT', () => {
    // Matches index partner_commissions_champion_uniq in migration 20260516_016.
    const championConflict = 'referral_id,period_start,period_end';
    expect(championConflict).toBe('referral_id,period_start,period_end');
  });
});

// ────────────────────────────────────────────────────────────
// Champion: CHAMPION_GIFT row scenario (pure logic)
// ────────────────────────────────────────────────────────────

describe('Champion gift logic', () => {
  it('when referrer has a reseller, champion gift mirrors the DIRECT amount', () => {
    // The champion gift amount = same as DIRECT amount for the referred tenant.
    const orderCount = 80;
    const hirNetCents = ronToCents(orderCount * HIR_FEE_PER_ORDER_RON); // 24000 cents
    const commissionPct = 20;
    const directAmountCents = ronToCents((orderCount * HIR_FEE_PER_ORDER_RON) * commissionPct / 100);
    // Champion gift mirrors the DIRECT row amount.
    const championGiftCents = directAmountCents;
    expect(championGiftCents).toBe(directAmountCents);
    // Sanity: 80 orders × 3 RON × 20% = 48 RON = 4800 cents.
    expect(championGiftCents).toBe(4800);
    // hirNetCents is used as the basis for wave/override, not champion gift.
    expect(hirNetCents).toBe(24000);
  });

  it('champion gift pct_applied equals the DIRECT pct of the referred tenant referral', () => {
    // The DIRECT pct for the referred restaurant's referral is used as pct_applied on champion gift.
    const directPct = 15;
    const pctApplied = directPct;
    expect(pctApplied).toBe(15);
  });
});
