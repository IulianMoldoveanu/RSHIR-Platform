import { describe, it, expect } from 'vitest';
import { formatDistanceM, formatDurationMs, elapsedMs } from '@hir/ui';

// These three drive every number a courier, a fleet manager, and the platform
// see about travelled distance. The cases that matter are the ones where a
// wrong answer is indistinguishable from a real one.

describe('formatDistanceM', () => {
  it('renders sub-kilometre distances in whole metres', () => {
    expect(formatDistanceM(0)).toBe('0 m');
    expect(formatDistanceM(640.4)).toBe('640 m');
    expect(formatDistanceM(999)).toBe('999 m');
  });

  it('switches to one-decimal kilometres at 1000 m', () => {
    expect(formatDistanceM(1000)).toBe('1,0 km');
    expect(formatDistanceM(4249)).toBe('4,2 km');
    expect(formatDistanceM(7506)).toBe('7,5 km');
  });

  it('honours an explicit locale for the decimal separator', () => {
    expect(formatDistanceM(4250, 'en-GB')).toBe('4.3 km');
  });

  // The whole point of the null contract: "not measured" must never be
  // rendered as a confident zero, because a fleet manager would act on it.
  it('renders unmeasured distances as an em dash, distinct from 0 m', () => {
    expect(formatDistanceM(null)).toBe('—');
    expect(formatDistanceM(undefined)).toBe('—');
    expect(formatDistanceM(Number.NaN)).toBe('—');
    expect(formatDistanceM(-1)).toBe('—');
    expect(formatDistanceM(0)).not.toBe('—');
  });
});

describe('formatDurationMs', () => {
  it('rounds to whole minutes below an hour', () => {
    expect(formatDurationMs(60_000)).toBe('1 min');
    expect(formatDurationMs(23 * 60_000)).toBe('23 min');
    expect(formatDurationMs(59 * 60_000)).toBe('59 min');
  });

  it('never reports 0 min for a real but very short delivery', () => {
    expect(formatDurationMs(1)).toBe('1 min');
    expect(formatDurationMs(20_000)).toBe('1 min');
  });

  it('splits hours and minutes past the hour', () => {
    expect(formatDurationMs(60 * 60_000)).toBe('1 h');
    expect(formatDurationMs(72 * 60_000)).toBe('1 h 12 min');
    expect(formatDurationMs(150 * 60_000)).toBe('2 h 30 min');
  });

  it('renders missing or negative durations as an em dash', () => {
    expect(formatDurationMs(null)).toBe('—');
    expect(formatDurationMs(undefined)).toBe('—');
    expect(formatDurationMs(-1)).toBe('—');
  });
});

describe('elapsedMs', () => {
  it('measures the gap between two timestamps', () => {
    expect(elapsedMs('2026-08-04T10:00:00Z', '2026-08-04T10:42:00Z')).toBe(42 * 60_000);
  });

  it('returns null when either end is missing', () => {
    expect(elapsedMs(null, '2026-08-04T10:00:00Z')).toBeNull();
    expect(elapsedMs('2026-08-04T10:00:00Z', null)).toBeNull();
    expect(elapsedMs(undefined, undefined)).toBeNull();
  });

  // An order whose picked_up_at predates its accepted_at is corrupt data;
  // reporting a negative duration would dress it up as a valid measurement.
  it('returns null rather than a negative duration for inverted pairs', () => {
    expect(elapsedMs('2026-08-04T10:42:00Z', '2026-08-04T10:00:00Z')).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(elapsedMs('not-a-date', '2026-08-04T10:00:00Z')).toBeNull();
  });
});
