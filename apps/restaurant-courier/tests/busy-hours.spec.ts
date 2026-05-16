import { describe, it, expect } from 'vitest';
import {
  BUSY_HOURS_MATRIX,
  HOUR_LABELS,
  intensityAtDate,
  intensityClass,
} from '../src/lib/busy-hours';

describe('BUSY_HOURS_MATRIX shape', () => {
  it('has 7 day rows', () => {
    expect(BUSY_HOURS_MATRIX).toHaveLength(7);
  });

  it('each row has 14 hour cells', () => {
    for (const row of BUSY_HOURS_MATRIX) {
      expect(row).toHaveLength(14);
    }
  });

  it('all cells are in 0..4', () => {
    for (const row of BUSY_HOURS_MATRIX) {
      for (const cell of row) {
        expect(cell).toBeGreaterThanOrEqual(0);
        expect(cell).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe('HOUR_LABELS', () => {
  it('spans 8..21', () => {
    expect(HOUR_LABELS[0]).toBe(8);
    expect(HOUR_LABELS[HOUR_LABELS.length - 1]).toBe(21);
  });
});

describe('intensityAtDate', () => {
  it('maps Monday 12:00 to dayIdx=0, hourIdx=4', () => {
    // 2026-05-18 is a Monday.
    const d = new Date(2026, 4, 18, 12, 0, 0);
    const r = intensityAtDate(d);
    expect(r.dayIdx).toBe(0);
    expect(r.hourIdx).toBe(4);
    expect(r.intensity).toBe(BUSY_HOURS_MATRIX[0][4]);
  });

  it('maps Sunday 20:00 to dayIdx=6, hourIdx=12', () => {
    // 2026-05-17 is a Sunday.
    const d = new Date(2026, 4, 17, 20, 0, 0);
    const r = intensityAtDate(d);
    expect(r.dayIdx).toBe(6);
    expect(r.hourIdx).toBe(12);
  });

  it('returns hourIdx=null for early-morning hours', () => {
    const d = new Date(2026, 4, 18, 4, 0, 0);
    const r = intensityAtDate(d);
    expect(r.hourIdx).toBeNull();
    expect(r.intensity).toBeNull();
  });

  it('returns hourIdx=null for late-night hours', () => {
    const d = new Date(2026, 4, 18, 23, 30, 0);
    const r = intensityAtDate(d);
    expect(r.hourIdx).toBeNull();
  });
});

describe('intensityClass', () => {
  it('returns a class string for each intensity', () => {
    for (const v of [0, 1, 2, 3, 4] as const) {
      expect(intensityClass(v)).toMatch(/bg-/);
    }
  });
});
