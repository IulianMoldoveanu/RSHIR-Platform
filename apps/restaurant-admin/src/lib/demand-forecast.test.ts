// Unit tests for the demand-forecast algorithm.
// Run with: pnpm --filter restaurant-admin test
// (vitest, node environment)

import { describe, it, expect } from 'vitest';
import { computeForecastCells } from './demand-forecast';

// Fixed reference: Wednesday 2026-05-13 00:00 UTC
const REF = new Date('2026-05-13T00:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** ISO string N days before REF at the given UTC hour. */
function ts(daysAgo: number, hour = 12): string {
  const d = new Date(REF.getTime() - daysAgo * MS_PER_DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

// ─── Happy path ────────────────────────────────────────────────────────────────

describe('empty orders', () => {
  it('returns no cells', () => {
    expect(computeForecastCells([], REF)).toHaveLength(0);
  });
});

describe('orders outside window', () => {
  it('are ignored', () => {
    // 9 weeks ago
    const cells = computeForecastCells([{ created_at: ts(63, 10) }], REF, 8);
    expect(cells).toHaveLength(0);
  });
});

describe('single order', () => {
  it('produces one non-zero cell', () => {
    const cells = computeForecastCells([{ created_at: ts(3, 14) }], REF);
    expect(cells).toHaveLength(1);
    expect(cells[0].mean_count).toBeGreaterThan(0);
    expect(cells[0].forecast_count).toBeGreaterThan(0);
    expect(cells[0].sample_weeks).toBe(1);
  });
});

// ─── Mean accuracy ─────────────────────────────────────────────────────────────

describe('uniform 3-orders/week × 4 weeks', () => {
  it('mean equals 3', () => {
    const orders: { created_at: string }[] = [];
    for (let w = 0; w < 4; w++) {
      for (let i = 0; i < 3; i++) {
        orders.push({ created_at: ts(7 * w + 1, 19) });
      }
    }
    const cells = computeForecastCells(orders, REF, 8);
    const targetDow = new Date(ts(1, 19)).getUTCDay();
    const cell = cells.find((c) => c.hour_of_day === 19 && c.day_of_week === targetDow);
    expect(cell).toBeDefined();
    expect(cell!.mean_count).toBeCloseTo(3, 1);
  });
});

// ─── Trend ratio ───────────────────────────────────────────────────────────────

describe('trend_ratio', () => {
  it('is clamped to [0.5, 2.0]', () => {
    // Explosive growth: 25 orders/week for last 2 weeks, nothing before.
    const orders: { created_at: string }[] = [];
    for (let w = 0; w < 2; w++) {
      for (let i = 0; i < 25; i++) {
        orders.push({ created_at: ts(7 * w + 1, 20) });
      }
    }
    const cells = computeForecastCells(orders, REF, 8);
    for (const cell of cells) {
      expect(cell.trend_ratio).toBeLessThanOrEqual(2.0);
      expect(cell.trend_ratio).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('exceeds 1 when recent beats older', () => {
    // Recent 2 weeks: 4/week; older 6 weeks: 1/week → ratio = min(2.0, 4/1) = 2.0
    const orders: { created_at: string }[] = [];
    for (let w = 0; w < 2; w++) {
      for (let i = 0; i < 4; i++) orders.push({ created_at: ts(7 * w + 1, 18) });
    }
    for (let w = 2; w < 8; w++) {
      orders.push({ created_at: ts(7 * w + 1, 18) });
    }
    const cells = computeForecastCells(orders, REF, 8);
    const targetDow = new Date(ts(1, 18)).getUTCDay();
    const cell = cells.find((c) => c.hour_of_day === 18 && c.day_of_week === targetDow);
    expect(cell).toBeDefined();
    expect(cell!.trend_ratio).toBeCloseTo(2.0, 1);
  });
});

// ─── CI ────────────────────────────────────────────────────────────────────────

describe('ci_lower', () => {
  it('is never negative', () => {
    const cells = computeForecastCells([{ created_at: ts(2, 10) }], REF, 8);
    for (const cell of cells) {
      expect(cell.ci_lower).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── Cold-start ────────────────────────────────────────────────────────────────

describe('cold-start (< 4 weeks)', () => {
  it('all cells have sample_weeks < 4', () => {
    const orders = [ts(1, 12), ts(8, 12)].map((c) => ({ created_at: c }));
    const cells = computeForecastCells(orders, REF, 8);
    for (const cell of cells) {
      expect(cell.sample_weeks).toBeLessThan(4);
    }
  });
});

// ─── Forecast = mean × trend ───────────────────────────────────────────────────

describe('forecast_count', () => {
  it('equals mean × trend_ratio (within float precision)', () => {
    const orders: { created_at: string }[] = [];
    for (let w = 0; w < 6; w++) {
      for (let i = 0; i < 3; i++) {
        orders.push({ created_at: ts(7 * w + 1, 15) });
      }
    }
    const cells = computeForecastCells(orders, REF, 8);
    const targetDow = new Date(ts(1, 15)).getUTCDay();
    const cell = cells.find((c) => c.hour_of_day === 15 && c.day_of_week === targetDow);
    expect(cell).toBeDefined();
    expect(cell!.forecast_count).toBeCloseTo(cell!.mean_count * cell!.trend_ratio, 1);
  });
});

// ─── sample_weeks ─────────────────────────────────────────────────────────────

describe('sample_weeks', () => {
  it('is bounded between 1 and maxWeeks', () => {
    const orders = [1, 8, 15, 22, 29, 36, 43, 50].map((d) => ({
      created_at: ts(d, 10),
    }));
    const cells = computeForecastCells(orders, REF, 8);
    for (const cell of cells) {
      expect(cell.sample_weeks).toBeGreaterThanOrEqual(1);
      expect(cell.sample_weeks).toBeLessThanOrEqual(8);
    }
  });
});
