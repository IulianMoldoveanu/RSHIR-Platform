import { describe, it, expect } from 'vitest';
import {
  DEFAULT_QUIET,
  isInsideQuietHours,
  type QuietHours,
} from '../src/lib/quiet-hours';

function at(hh: number, mm = 0): Date {
  // Use a fixed date so DST + tz doesn't matter; only HH:MM matter.
  const d = new Date(2026, 4, 18, hh, mm, 0);
  return d;
}

describe('isInsideQuietHours', () => {
  it('returns false when disabled even mid-window', () => {
    const q: QuietHours = { ...DEFAULT_QUIET, enabled: false };
    expect(isInsideQuietHours(q, at(23, 0))).toBe(false);
  });

  it('returns false for malformed bounds', () => {
    const q: QuietHours = { enabled: true, startHHmm: 'bad', endHHmm: '07:00' };
    expect(isInsideQuietHours(q, at(2, 0))).toBe(false);
  });

  it('daytime window: 09:00 to 17:00 inclusive-start, exclusive-end', () => {
    const q: QuietHours = { enabled: true, startHHmm: '09:00', endHHmm: '17:00' };
    expect(isInsideQuietHours(q, at(8, 59))).toBe(false);
    expect(isInsideQuietHours(q, at(9, 0))).toBe(true);
    expect(isInsideQuietHours(q, at(12, 30))).toBe(true);
    expect(isInsideQuietHours(q, at(16, 59))).toBe(true);
    expect(isInsideQuietHours(q, at(17, 0))).toBe(false);
  });

  it('overnight window: 22:00 to 07:00 wraps midnight', () => {
    const q: QuietHours = { enabled: true, startHHmm: '22:00', endHHmm: '07:00' };
    expect(isInsideQuietHours(q, at(21, 59))).toBe(false);
    expect(isInsideQuietHours(q, at(22, 0))).toBe(true);
    expect(isInsideQuietHours(q, at(23, 30))).toBe(true);
    expect(isInsideQuietHours(q, at(0, 1))).toBe(true);
    expect(isInsideQuietHours(q, at(3, 0))).toBe(true);
    expect(isInsideQuietHours(q, at(6, 59))).toBe(true);
    expect(isInsideQuietHours(q, at(7, 0))).toBe(false);
  });

  it('empty window (start == end) is always false', () => {
    const q: QuietHours = { enabled: true, startHHmm: '12:00', endHHmm: '12:00' };
    expect(isInsideQuietHours(q, at(12, 0))).toBe(false);
    expect(isInsideQuietHours(q, at(13, 0))).toBe(false);
  });
});
