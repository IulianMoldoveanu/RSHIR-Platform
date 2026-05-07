import { describe, expect, it } from 'vitest';
import { readPreOrderSettings, checkScheduledForBounds } from './pre-orders';

describe('readPreOrderSettings', () => {
  it('returns disabled defaults for null/undefined/empty', () => {
    expect(readPreOrderSettings(null).enabled).toBe(false);
    expect(readPreOrderSettings(undefined).enabled).toBe(false);
    expect(readPreOrderSettings({}).enabled).toBe(false);
    expect(readPreOrderSettings({ pre_orders: null }).enabled).toBe(false);
  });

  it('reads enabled flag honestly (boolean true required)', () => {
    expect(readPreOrderSettings({ pre_orders: { enabled: true } }).enabled).toBe(true);
    expect(readPreOrderSettings({ pre_orders: { enabled: 'true' } }).enabled).toBe(false);
    expect(readPreOrderSettings({ pre_orders: { enabled: 1 } }).enabled).toBe(false);
  });

  it('clamps min_advance_hours into [1, 720]', () => {
    expect(readPreOrderSettings({ pre_orders: { min_advance_hours: 0 } }).min_advance_hours).toBe(1);
    expect(readPreOrderSettings({ pre_orders: { min_advance_hours: 999 } }).min_advance_hours).toBe(720);
    expect(readPreOrderSettings({ pre_orders: { min_advance_hours: 12 } }).min_advance_hours).toBe(12);
  });

  it('clamps max_advance_days into [1, 60]', () => {
    expect(readPreOrderSettings({ pre_orders: { max_advance_days: -5 } }).max_advance_days).toBe(1);
    expect(readPreOrderSettings({ pre_orders: { max_advance_days: 200 } }).max_advance_days).toBe(60);
  });

  it('falls back to defaults on garbage values', () => {
    const out = readPreOrderSettings({ pre_orders: { min_advance_hours: 'foo' } });
    expect(out.min_advance_hours).toBe(24);
  });
});

describe('checkScheduledForBounds', () => {
  const now = new Date('2026-05-08T10:00:00Z');
  const settings = {
    enabled: true,
    min_advance_hours: 24,
    max_advance_days: 14,
    min_subtotal_ron: 0,
  };

  it('rejects timestamps before min advance', () => {
    const r = checkScheduledForBounds('2026-05-08T20:00:00Z', settings, now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('too_soon');
  });

  it('accepts timestamps in the valid window', () => {
    const r = checkScheduledForBounds('2026-05-12T18:00:00Z', settings, now);
    expect(r.ok).toBe(true);
  });

  it('rejects timestamps past max advance', () => {
    const r = checkScheduledForBounds('2026-06-30T18:00:00Z', settings, now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('too_far');
  });

  it('rejects unparsable input', () => {
    const r = checkScheduledForBounds('not-a-date', settings, now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid');
  });

  it('exactly at min boundary is accepted', () => {
    const exact = new Date(now.getTime() + 24 * 3_600_000).toISOString();
    const r = checkScheduledForBounds(exact, settings, now);
    expect(r.ok).toBe(true);
  });
});
