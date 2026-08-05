import { describe, it, expect } from 'vitest';
import { priorWeekWindow } from './invoice-window';

const iso = (d: Date) => d.toISOString();

describe('priorWeekWindow', () => {
  it('returns the week that just closed, never the running one', () => {
    // Thursday 2026-08-06. The running week started Monday the 3rd, so the
    // week that closed is 27 July → 3 August.
    const w = priorWeekWindow(1, new Date('2026-08-06T15:00:00Z'));
    expect(iso(w.start)).toBe('2026-07-27T00:00:00.000Z');
    expect(iso(w.end)).toBe('2026-08-03T00:00:00.000Z');
  });

  it('treats Monday as the first day, not Sunday', () => {
    // Sunday 2026-08-09 still belongs to the week that began Monday the 3rd,
    // so the closed week is the one before it. Getting this wrong with a
    // Sunday-first calendar would shift every invoice by a day.
    const w = priorWeekWindow(1, new Date('2026-08-09T23:59:00Z'));
    expect(iso(w.start)).toBe('2026-07-27T00:00:00.000Z');
    expect(iso(w.end)).toBe('2026-08-03T00:00:00.000Z');
  });

  it('does not include today when today is a Monday', () => {
    // Monday 2026-08-03: the week starting today is still open.
    const w = priorWeekWindow(1, new Date('2026-08-03T09:00:00Z'));
    expect(iso(w.start)).toBe('2026-07-27T00:00:00.000Z');
    expect(iso(w.end)).toBe('2026-08-03T00:00:00.000Z');
  });

  it('steps back a whole week at a time, leaving no gap and no overlap', () => {
    const now = new Date('2026-08-06T15:00:00Z');
    const first = priorWeekWindow(1, now);
    const second = priorWeekWindow(2, now);
    expect(iso(second.end)).toBe(iso(first.start));
    expect(second.end.getTime() - second.start.getTime()).toBe(7 * 86_400_000);
  });

  it('crosses a month boundary without drifting', () => {
    const w = priorWeekWindow(1, new Date('2026-03-04T12:00:00Z'));
    expect(iso(w.start)).toBe('2026-02-23T00:00:00.000Z');
    expect(iso(w.end)).toBe('2026-03-02T00:00:00.000Z');
  });

  it('refuses the current week and any non-integer offset', () => {
    const now = new Date('2026-08-06T15:00:00Z');
    expect(() => priorWeekWindow(0, now)).toThrow(RangeError);
    expect(() => priorWeekWindow(-1, now)).toThrow(RangeError);
    expect(() => priorWeekWindow(1.5, now)).toThrow(RangeError);
  });
});
