import { describe, it, expect } from 'vitest';
import { classifyExpiry, formatRoDate } from '../src/lib/courier-documents';

describe('classifyExpiry', () => {
  const now = new Date('2026-05-16T12:00:00');

  it('returns unset for null input', () => {
    const r = classifyExpiry(null, now);
    expect(r.state).toBe('unset');
    expect(r.daysRemaining).toBeNull();
  });

  it('returns unset for garbage', () => {
    const r = classifyExpiry('not-a-date', now);
    expect(r.state).toBe('unset');
  });

  it('classifies a date 60 days in the future as ok', () => {
    const r = classifyExpiry('2026-07-15', now);
    expect(r.state).toBe('ok');
    expect(r.daysRemaining).toBeGreaterThan(30);
  });

  it('classifies a date 20 days in the future as warning', () => {
    const r = classifyExpiry('2026-06-05', now);
    expect(r.state).toBe('warning');
  });

  it('classifies a date 3 days in the future as critical', () => {
    const r = classifyExpiry('2026-05-19', now);
    expect(r.state).toBe('critical');
  });

  it('classifies today as critical (0 days)', () => {
    const r = classifyExpiry('2026-05-16', now);
    expect(r.state).toBe('critical');
    expect(r.daysRemaining).toBe(0);
  });

  it('classifies a past date as expired', () => {
    const r = classifyExpiry('2026-05-01', now);
    expect(r.state).toBe('expired');
    expect(r.daysRemaining).toBeLessThan(0);
  });
});

describe('formatRoDate', () => {
  it('formats ISO date as dd.mm.yyyy', () => {
    expect(formatRoDate('2026-05-19')).toBe('19.05.2026');
  });

  it('returns em-dash for null', () => {
    expect(formatRoDate(null)).toBe('—');
  });

  it('returns the input unchanged when shape is unexpected', () => {
    expect(formatRoDate('whatever')).toBe('whatever');
  });
});
