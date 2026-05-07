// Lane AB-TESTING-FRAMEWORK-STUB — unit tests for assignment determinism.

import { describe, expect, it } from 'vitest';
import { fnv1a32, parseVariants, pickVariant, resolveVariant } from './assign';

describe('fnv1a32', () => {
  it('is deterministic for the same input', () => {
    const a = fnv1a32('hello:world');
    const b = fnv1a32('hello:world');
    expect(a).toBe(b);
  });

  it('returns an unsigned 32-bit integer', () => {
    const h = fnv1a32('subject-42');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(h)).toBe(true);
  });

  it('produces distinct hashes for trivial collisions', () => {
    expect(fnv1a32('a')).not.toBe(fnv1a32('b'));
    expect(fnv1a32('foo:bar')).not.toBe(fnv1a32('foo:baz'));
  });
});

describe('parseVariants', () => {
  it('accepts a well-formed array', () => {
    expect(
      parseVariants([
        { key: 'control', weight: 50 },
        { key: 'variant_a', weight: 50 },
      ]),
    ).toEqual([
      { key: 'control', weight: 50 },
      { key: 'variant_a', weight: 50 },
    ]);
  });

  it('rejects non-array input', () => {
    expect(parseVariants(null)).toEqual([]);
    expect(parseVariants({})).toEqual([]);
    expect(parseVariants('control')).toEqual([]);
  });

  it('rejects entries with missing or invalid fields', () => {
    expect(parseVariants([{ key: '', weight: 1 }])).toEqual([]);
    expect(parseVariants([{ key: 'control', weight: 0 }])).toEqual([]);
    expect(parseVariants([{ key: 'control', weight: -5 }])).toEqual([]);
    expect(parseVariants([{ key: 'control' }])).toEqual([]);
    expect(parseVariants([{ weight: 1 }])).toEqual([]);
  });

  it('floors fractional weights', () => {
    expect(parseVariants([{ key: 'a', weight: 1.9 }])).toEqual([
      { key: 'a', weight: 1 },
    ]);
  });
});

describe('pickVariant', () => {
  const variants = [
    { key: 'control', weight: 50 },
    { key: 'variant_a', weight: 50 },
  ];

  it('returns null on empty inputs', () => {
    expect(pickVariant('', 'subject', variants)).toBeNull();
    expect(pickVariant('exp', '', variants)).toBeNull();
    expect(pickVariant('exp', 'subject', [])).toBeNull();
  });

  it('is sticky for the same subject', () => {
    const a = pickVariant('exp_v1', 'subject-42', variants);
    const b = pickVariant('exp_v1', 'subject-42', variants);
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });

  it('produces both variants across many subjects (50/50)', () => {
    const counts: Record<string, number> = { control: 0, variant_a: 0 };
    for (let i = 0; i < 1000; i += 1) {
      const v = pickVariant('exp_v1', `subject-${i}`, variants);
      if (v) counts[v] = (counts[v] ?? 0) + 1;
    }
    // Loose bound — FNV-1a + small alphabet shouldn't pathologically
    // skew. If this ever flakes, switch to a non-deterministic seed.
    expect(counts.control).toBeGreaterThan(300);
    expect(counts.variant_a).toBeGreaterThan(300);
  });

  it('honours weight asymmetry', () => {
    const skewed = [
      { key: 'control', weight: 90 },
      { key: 'variant_a', weight: 10 },
    ];
    const counts: Record<string, number> = { control: 0, variant_a: 0 };
    for (let i = 0; i < 1000; i += 1) {
      const v = pickVariant('skewed', `s-${i}`, skewed);
      if (v) counts[v] = (counts[v] ?? 0) + 1;
    }
    expect(counts.control).toBeGreaterThan(counts.variant_a * 4);
  });
});

describe('resolveVariant', () => {
  it('returns null for inactive experiments', () => {
    expect(
      resolveVariant(
        {
          key: 'exp',
          active: false,
          variants: [{ key: 'a', weight: 1 }],
        },
        'subject',
      ),
    ).toBeNull();
  });

  it('returns null for null record', () => {
    expect(resolveVariant(null, 'subject')).toBeNull();
  });

  it('resolves a valid record', () => {
    const v = resolveVariant(
      {
        key: 'exp',
        active: true,
        variants: [
          { key: 'control', weight: 50 },
          { key: 'variant_a', weight: 50 },
        ],
      },
      'subject-1',
    );
    expect(['control', 'variant_a']).toContain(v);
  });

  it('returns null when variants jsonb is malformed', () => {
    expect(
      resolveVariant(
        {
          key: 'exp',
          active: true,
          variants: 'not-an-array',
        },
        'subject',
      ),
    ).toBeNull();
  });
});
