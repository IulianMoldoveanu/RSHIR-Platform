import { describe, it, expect } from 'vitest';
import {
  slotKey,
  toggleSlot,
  buildMailtoBody,
  MAX_SLOTS,
} from '../src/lib/schedule-slots';

// ---------------------------------------------------------------------------
// slotKey
// ---------------------------------------------------------------------------

describe('slotKey', () => {
  it('formats a standard date + hour correctly', () => {
    const d = new Date(2026, 4, 19, 0, 0, 0); // 2026-05-19
    expect(slotKey(d, 9)).toBe('2026-05-19T09');
    expect(slotKey(d, 14)).toBe('2026-05-19T14');
  });

  it('zero-pads single-digit month and day', () => {
    const d = new Date(2026, 0, 5); // 2026-01-05
    expect(slotKey(d, 8)).toBe('2026-01-05T08');
  });
});

// ---------------------------------------------------------------------------
// toggleSlot
// ---------------------------------------------------------------------------

describe('toggleSlot', () => {
  it('adds a slot when not present and under cap', () => {
    const slots = new Set<string>();
    const next = toggleSlot(slots, '2026-05-19T09');
    expect(next.has('2026-05-19T09')).toBe(true);
    expect(next.size).toBe(1);
  });

  it('removes a slot when already present', () => {
    const slots = new Set(['2026-05-19T09']);
    const next = toggleSlot(slots, '2026-05-19T09');
    expect(next.has('2026-05-19T09')).toBe(false);
    expect(next.size).toBe(0);
  });

  it('does not add when at MAX_SLOTS cap', () => {
    const slots = new Set<string>();
    for (let i = 0; i < MAX_SLOTS; i++) {
      slots.add(`2026-05-${String(i + 1).padStart(2, '0')}T08`);
    }
    expect(slots.size).toBe(MAX_SLOTS);
    const next = toggleSlot(slots, '2026-05-19T22');
    expect(next.has('2026-05-19T22')).toBe(false);
    expect(next.size).toBe(MAX_SLOTS);
  });

  it('does not mutate the original set', () => {
    const original = new Set(['2026-05-19T09']);
    toggleSlot(original, '2026-05-19T09');
    expect(original.has('2026-05-19T09')).toBe(true);
  });

  it('still allows removal when at MAX_SLOTS cap', () => {
    const slots = new Set<string>();
    for (let i = 0; i < MAX_SLOTS; i++) {
      slots.add(`key-${i}`);
    }
    const key = 'key-0';
    const next = toggleSlot(slots, key);
    expect(next.has(key)).toBe(false);
    expect(next.size).toBe(MAX_SLOTS - 1);
  });
});

// ---------------------------------------------------------------------------
// buildMailtoBody
// ---------------------------------------------------------------------------

describe('buildMailtoBody', () => {
  it('returns fallback message for empty set', () => {
    const body = buildMailtoBody(new Set());
    expect(body).toBe('Nu am rezervat nicio tură.');
  });

  it('formats a single slot correctly', () => {
    // 2026-05-18 is a Monday → Luni
    const body = buildMailtoBody(new Set(['2026-05-18T09']));
    expect(body).toContain('Luni');
    expect(body).toContain('18/05');
    expect(body).toContain('09:00-10:00');
  });

  it('collapses consecutive hours into a range', () => {
    const slots = new Set(['2026-05-18T09', '2026-05-18T10', '2026-05-18T11']);
    const body = buildMailtoBody(slots);
    expect(body).toContain('09:00-12:00');
  });

  it('emits two separate ranges for non-consecutive hours', () => {
    const slots = new Set(['2026-05-18T09', '2026-05-18T11']);
    const body = buildMailtoBody(slots);
    expect(body).toContain('09:00-10:00');
    expect(body).toContain('11:00-12:00');
  });

  it('emits one line per day', () => {
    const slots = new Set([
      '2026-05-18T09', // Monday
      '2026-05-19T10', // Tuesday
    ]);
    const lines = buildMailtoBody(slots).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Luni');
    expect(lines[1]).toContain('Marți');
  });
});
