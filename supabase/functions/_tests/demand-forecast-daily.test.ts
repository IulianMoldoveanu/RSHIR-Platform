// Tests for demand-forecast-daily algorithm.
//
// Run with:
//   deno test --allow-env supabase/functions/_tests/demand-forecast-daily.test.ts
//
// These tests exercise the pure `computeForecastCells` function — no DB
// connection required.

import {
  assert,
  assertEquals,
  assertAlmostEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { computeForecastCells } from '../demand-forecast-daily/index.ts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a UTC ISO string for a given offset from referenceNow. */
function tsAgo(referenceNow: Date, daysAgo: number, hour = 12): string {
  const d = new Date(referenceNow);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

// A fixed reference point (Wednesday 2026-05-13 00:00 UTC)
const REF = new Date('2026-05-13T00:00:00Z');

// ─── Tests ────────────────────────────────────────────────────────────────────

Deno.test('empty orders → no cells returned', () => {
  const cells = computeForecastCells([], REF, 8);
  assertEquals(cells.length, 0);
});

Deno.test('orders outside window are ignored', () => {
  // 9 weeks ago — outside the 8-week window.
  const oldOrder = { created_at: tsAgo(REF, 63, 10) };
  const cells = computeForecastCells([oldOrder], REF, 8);
  assertEquals(cells.length, 0);
});

Deno.test('single order produces one non-zero cell', () => {
  // One order 3 days ago at 14:00 UTC.
  const order = { created_at: tsAgo(REF, 3, 14) };
  const cells = computeForecastCells([order], REF, 8);
  assertEquals(cells.length, 1);
  assert(cells[0].mean_count > 0, 'mean should be positive');
  assert(cells[0].forecast_count > 0, 'forecast should be positive');
  assertEquals(cells[0].sample_weeks, 1);
});

Deno.test('mean is correct for uniform weekly pattern', () => {
  // 3 orders per week on the same DOW/hour for 4 weeks.
  // Each week contributes 3 orders in the same bucket → mean = 3.
  const orders: { created_at: string }[] = [];
  for (let week = 0; week < 4; week++) {
    for (let order = 0; order < 3; order++) {
      // Place on day 7*week+1 ago at hour 19, same DOW each week.
      orders.push({ created_at: tsAgo(REF, 7 * week + 1, 19) });
    }
  }
  const cells = computeForecastCells(orders, REF, 8);

  // Find the bucket for hour 19 (DOW depends on REF - 1 day).
  const targetDow = new Date(tsAgo(REF, 1, 19)).getUTCDay();
  const cell = cells.find((c) => c.hour_of_day === 19 && c.day_of_week === targetDow);
  assert(cell !== undefined, 'cell for the target bucket should exist');
  assertAlmostEquals(cell.mean_count, 3, 0.01, 'mean should be 3 for uniform 3/week pattern');
});

Deno.test('trend_ratio is clamped to [0.5, 2.0]', () => {
  // Simulate an explosive tenant: 0 orders weeks 3-8, 50 orders in last 2 weeks.
  const orders: { created_at: string }[] = [];
  // Last 2 weeks: 25 orders each.
  for (let w = 0; w < 2; w++) {
    for (let i = 0; i < 25; i++) {
      orders.push({ created_at: tsAgo(REF, 7 * w + 1, 20) });
    }
  }
  const cells = computeForecastCells(orders, REF, 8);
  for (const cell of cells) {
    assert(cell.trend_ratio <= 2.0, `trend_ratio ${cell.trend_ratio} exceeds 2.0 max`);
    assert(cell.trend_ratio >= 0.5, `trend_ratio ${cell.trend_ratio} below 0.5 min`);
  }
});

Deno.test('trend_ratio > 1 when recent weeks beat older weeks', () => {
  // Weeks 0-1 (recent): 4 orders each → recentAvg = 4
  // Weeks 2-7 (older):  1 order each  → olderAvg  = 1
  // Expected trendRatio = min(2.0, 4/1) = 2.0
  const orders: { created_at: string }[] = [];
  for (let w = 0; w < 2; w++) {
    for (let i = 0; i < 4; i++) {
      orders.push({ created_at: tsAgo(REF, 7 * w + 1, 18) });
    }
  }
  for (let w = 2; w < 8; w++) {
    orders.push({ created_at: tsAgo(REF, 7 * w + 1, 18) });
  }
  const cells = computeForecastCells(orders, REF, 8);
  const targetDow = new Date(tsAgo(REF, 1, 18)).getUTCDay();
  const cell = cells.find((c) => c.hour_of_day === 18 && c.day_of_week === targetDow);
  assert(cell !== undefined, 'target cell should exist');
  assertAlmostEquals(cell.trend_ratio, 2.0, 0.01, 'trend_ratio should be clamped at 2.0');
});

Deno.test('ci_lower is always >= 0', () => {
  const orders: { created_at: string }[] = [];
  // Single order — std=0, ci_lower = mean. With 1 sample no correction.
  orders.push({ created_at: tsAgo(REF, 2, 10) });
  const cells = computeForecastCells(orders, REF, 8);
  for (const cell of cells) {
    assert(cell.ci_lower >= 0, 'ci_lower must never be negative');
  }
});

Deno.test('sample_weeks reflects how many distinct weeks had data', () => {
  // 3 orders, all in week 0 (most recent week).
  const orders = [
    { created_at: tsAgo(REF, 1, 10) },
    { created_at: tsAgo(REF, 2, 10) },
    { created_at: tsAgo(REF, 3, 10) },
  ];
  const cells = computeForecastCells(orders, REF, 8);
  // All orders land in week index 0 → actualWeeks = 1 at most
  // (unless REF-2 and REF-3 cross the 7-day boundary into week 1)
  for (const cell of cells) {
    assert(cell.sample_weeks >= 1, 'sample_weeks should be at least 1');
    assert(cell.sample_weeks <= 8, 'sample_weeks cannot exceed maxWeeks');
  }
});

Deno.test('cold-start: < 4 weeks of data → sample_weeks < 4 on all cells', () => {
  // Only 2 weeks of orders.
  const orders: { created_at: string }[] = [];
  for (let w = 0; w < 2; w++) {
    orders.push({ created_at: tsAgo(REF, 7 * w + 1, 12) });
  }
  const cells = computeForecastCells(orders, REF, 8);
  for (const cell of cells) {
    assert(
      cell.sample_weeks < 4,
      `expected < 4 sample_weeks for cold-start tenant, got ${cell.sample_weeks}`,
    );
  }
});

Deno.test('forecast_count = mean × trend_ratio (no rounding blowup)', () => {
  // 3 orders per week for 6 weeks → trend_ratio ~1.0 → forecast ~mean.
  const orders: { created_at: string }[] = [];
  for (let w = 0; w < 6; w++) {
    for (let i = 0; i < 3; i++) {
      orders.push({ created_at: tsAgo(REF, 7 * w + 1, 15) });
    }
  }
  const cells = computeForecastCells(orders, REF, 8);
  const targetDow = new Date(tsAgo(REF, 1, 15)).getUTCDay();
  const cell = cells.find((c) => c.hour_of_day === 15 && c.day_of_week === targetDow);
  assert(cell !== undefined, 'target cell should exist');
  // forecast = mean × trend (all close to 1.0 with stable data)
  assertAlmostEquals(
    cell.forecast_count,
    cell.mean_count * cell.trend_ratio,
    0.05,
    'forecast should equal mean × trend',
  );
});
