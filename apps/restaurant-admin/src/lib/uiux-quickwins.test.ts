// Pure unit tests for the UI/UX quick-win helpers (audit 2026-05-08).

import { describe, expect, it } from 'vitest';
import {
  buildSparklineSeries,
  filterDailyByRange,
  ticketAgingClass,
} from './uiux-quickwins';

const NOW = Date.UTC(2026, 4, 8, 12, 0, 0); // 2026-05-08 12:00 UTC

describe('ticketAgingClass (QW4)', () => {
  it('returns transparent for closed orders regardless of age', () => {
    expect(ticketAgingClass('DELIVERED', NOW - 60 * 60_000, NOW)).toBe('border-l-transparent');
    expect(ticketAgingClass('CANCELLED', NOW - 1_000, NOW)).toBe('border-l-transparent');
  });

  it('uses emerald for fresh tickets (<5 min)', () => {
    expect(ticketAgingClass('PENDING', NOW - 30 * 1_000, NOW)).toBe('border-l-emerald-300');
    expect(ticketAgingClass('PENDING', NOW - 4 * 60_000, NOW)).toBe('border-l-emerald-300');
  });

  it('uses amber between 5 and 15 min', () => {
    expect(ticketAgingClass('CONFIRMED', NOW - 5 * 60_000, NOW)).toBe('border-l-amber-400');
    expect(ticketAgingClass('PREPARING', NOW - 14 * 60_000, NOW)).toBe('border-l-amber-400');
  });

  it('uses orange between 15 and 25 min', () => {
    expect(ticketAgingClass('PREPARING', NOW - 17 * 60_000, NOW)).toBe('border-l-orange-500');
  });

  it('uses pulsing rose past 25 min', () => {
    expect(ticketAgingClass('READY', NOW - 30 * 60_000, NOW)).toBe(
      'border-l-rose-500 animate-pulse',
    );
    expect(ticketAgingClass('IN_DELIVERY', NOW - 2 * 60 * 60_000, NOW)).toBe(
      'border-l-rose-500 animate-pulse',
    );
  });
});

describe('buildSparklineSeries (QW2)', () => {
  it('returns exactly 7 entries even when input is empty', () => {
    expect(buildSparklineSeries([], NOW)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('aligns rows to today and pads missing days with 0', () => {
    // Today is 2026-05-08; provide values for today and 2 days ago.
    const rows = [
      { day: '2026-05-08', value: 100 },
      { day: '2026-05-06', value: 50 },
    ];
    const out = buildSparklineSeries(rows, NOW);
    expect(out).toHaveLength(7);
    // Last entry = today; index 4 = 2 days ago (offset 6-4 = 2).
    expect(out[6]).toBe(100);
    expect(out[4]).toBe(50);
    // All other days are 0.
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(0);
    expect(out[5]).toBe(0);
  });

  it('ignores days more than 6 days old', () => {
    const rows = [
      { day: '2026-04-01', value: 999 }, // way out of range
      { day: '2026-05-08', value: 1 },
    ];
    const out = buildSparklineSeries(rows, NOW);
    expect(out[6]).toBe(1);
    expect(out.includes(999)).toBe(false);
  });

  it('tolerates ISO timestamp suffix on day field', () => {
    const rows = [{ day: '2026-05-08T00:00:00Z', value: 42 }];
    const out = buildSparklineSeries(rows, NOW);
    expect(out[6]).toBe(42);
  });
});

describe('filterDailyByRange (QW10)', () => {
  const daily = [
    { day: '2026-02-08', value: 'old' },
    { day: '2026-04-09', value: 'just-30' },
    { day: '2026-05-02', value: 'within-7' },
    { day: '2026-05-08', value: 'today' },
  ];

  it('returns last 7 days', () => {
    const out = filterDailyByRange(daily, 7, NOW);
    expect(out.map((d) => d.value)).toEqual(['within-7', 'today']);
  });

  it('returns last 30 days', () => {
    const out = filterDailyByRange(daily, 30, NOW);
    expect(out.map((d) => d.value)).toEqual(['just-30', 'within-7', 'today']);
  });

  it('returns last 90 days', () => {
    const out = filterDailyByRange(daily, 90, NOW);
    expect(out.map((d) => d.value)).toEqual(['old', 'just-30', 'within-7', 'today']);
  });

  it('returns empty input untouched', () => {
    expect(filterDailyByRange([], 30, NOW)).toEqual([]);
  });
});
