import { describe, it, expect } from 'vitest';
import { labelForAction, formatRoRelative } from '../src/lib/audit-labels';

describe('labelForAction', () => {
  it('returns RO label for known action', () => {
    expect(labelForAction('order.cash_collected')).toBe('Ai marcat plata cash');
  });

  it('returns the raw action slug for unknown action', () => {
    expect(labelForAction('something.future')).toBe('something.future');
  });
});

describe('formatRoRelative', () => {
  const now = new Date('2026-05-16T12:00:00');

  it('returns "acum cateva secunde" for < 60s', () => {
    const iso = new Date(now.getTime() - 30 * 1000).toISOString();
    expect(formatRoRelative(iso, now)).toContain('acum');
  });

  it('returns minutes for under 1h', () => {
    const iso = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    expect(formatRoRelative(iso, now)).toBe('acum 5 min');
  });

  it('returns hours for under 24h', () => {
    const iso = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatRoRelative(iso, now)).toBe('acum 3 ore');
  });

  it('returns "ieri la HH:MM" for ~30h ago', () => {
    const iso = new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString();
    expect(formatRoRelative(iso, now)).toMatch(/^ieri la \d{2}:\d{2}$/);
  });

  it('returns full timestamp for >2 days ago', () => {
    const iso = '2026-05-10T08:30:00Z';
    expect(formatRoRelative(iso, now)).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
  });

  it('returns input unchanged for invalid ISO', () => {
    expect(formatRoRelative('not-a-date', now)).toBe('not-a-date');
  });
});
