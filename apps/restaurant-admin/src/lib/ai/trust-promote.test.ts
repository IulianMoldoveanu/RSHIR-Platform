// Tests for the F6 trust auto-promotion logic. The canonical module
// lives under `supabase/functions/_shared/trust-promote.ts` (Deno) but
// is pure TS with no Deno globals, so vitest in Node loads it fine.

import { describe, expect, test } from 'vitest';
import {
  evaluatePromotion,
  PROMOTE_TO_AUTO_REVERSIBLE_THRESHOLD,
  PROMOTE_TO_AUTO_FULL_THRESHOLD,
  DEMOTION_REVERT_THRESHOLD,
  formatPromotionNotification,
  formatDemotionNotification,
} from '../../../../../supabase/functions/_shared/trust-promote';

describe('evaluatePromotion — promotion path', () => {
  test('PROPOSE_ONLY -> AUTO_REVERSIBLE after 20 clean runs with 0 reverts', () => {
    const d = evaluatePromotion(
      {
        trustLevel: 'PROPOSE_ONLY',
        isDestructive: false,
        autoPromoteEligible: true,
        consecutiveCleanRuns: PROMOTE_TO_AUTO_REVERSIBLE_THRESHOLD,
      },
      { cleanRuns30d: PROMOTE_TO_AUTO_REVERSIBLE_THRESHOLD, reverts30d: 0 },
    );
    expect(d.kind).toBe('promote');
    if (d.kind === 'promote') {
      expect(d.from).toBe('PROPOSE_ONLY');
      expect(d.to).toBe('AUTO_REVERSIBLE');
      // Counter resets so the next-tier promotion requires a fresh streak.
      expect(d.newConsecutiveCleanRuns).toBe(0);
    }
  });

  test('PROPOSE_ONLY stays at PROPOSE_ONLY at 19 clean runs', () => {
    const d = evaluatePromotion(
      {
        trustLevel: 'PROPOSE_ONLY',
        isDestructive: false,
        autoPromoteEligible: true,
        consecutiveCleanRuns: PROMOTE_TO_AUTO_REVERSIBLE_THRESHOLD - 1,
      },
      { cleanRuns30d: PROMOTE_TO_AUTO_REVERSIBLE_THRESHOLD - 1, reverts30d: 0 },
    );
    expect(d.kind).toBe('no_change');
  });

  test('AUTO_REVERSIBLE -> AUTO_FULL after 50 clean runs with 0 reverts', () => {
    const d = evaluatePromotion(
      {
        trustLevel: 'AUTO_REVERSIBLE',
        isDestructive: false,
        autoPromoteEligible: true,
        consecutiveCleanRuns: PROMOTE_TO_AUTO_FULL_THRESHOLD,
      },
      { cleanRuns30d: PROMOTE_TO_AUTO_FULL_THRESHOLD, reverts30d: 0 },
    );
    expect(d.kind).toBe('promote');
    if (d.kind === 'promote') {
      expect(d.from).toBe('AUTO_REVERSIBLE');
      expect(d.to).toBe('AUTO_FULL');
    }
  });

  test('promotion does NOT skip tiers — 70 clean runs from PROPOSE_ONLY only goes to AUTO_REVERSIBLE', () => {
    const d = evaluatePromotion(
      {
        trustLevel: 'PROPOSE_ONLY',
        isDestructive: false,
        autoPromoteEligible: true,
        consecutiveCleanRuns: 70,
      },
      { cleanRuns30d: 70, reverts30d: 0 },
    );
    expect(d.kind).toBe('promote');
    if (d.kind === 'promote') {
      expect(d.to).toBe('AUTO_REVERSIBLE');
    }
  });
});

describe('evaluatePromotion — reset and demotion', () => {
  test('any single revert resets the counter', () => {
    const d = evaluatePromotion(
      {
        trustLevel: 'PROPOSE_ONLY',
        isDestructive: false,
        autoPromoteEligible: true,
        consecutiveCleanRuns: 15,
      },
      { cleanRuns30d: 15, reverts30d: 1 },
    );
    expect(d.kind).toBe('reset_counter');
    if (d.kind === 'reset_counter') {
      expect(d.newConsecutiveCleanRuns).toBe(0);
    }
  });

  test('reverts above the demotion threshold demote one level', () => {
    const d = evaluatePromotion(
      {
        trustLevel: 'AUTO_FULL',
        isDestructive: false,
        autoPromoteEligible: true,
        consecutiveCleanRuns: 5,
      },
      { cleanRuns30d: 5, reverts30d: DEMOTION_REVERT_THRESHOLD + 1 },
    );
    expect(d.kind).toBe('demote');
    if (d.kind === 'demote') {
      expect(d.from).toBe('AUTO_FULL');
      expect(d.to).toBe('AUTO_REVERSIBLE');
      expect(d.newConsecutiveCleanRuns).toBe(0);
    }
  });

  test('demotion at PROPOSE_ONLY floor only resets the counter', () => {
    const d = evaluatePromotion(
      {
        trustLevel: 'PROPOSE_ONLY',
        isDestructive: false,
        autoPromoteEligible: true,
        consecutiveCleanRuns: 5,
      },
      { cleanRuns30d: 5, reverts30d: DEMOTION_REVERT_THRESHOLD + 1 },
    );
    // 5 reverts > 1 revert -> reset path also triggers; but demotion
    // path takes precedence and at the floor returns reset_counter.
    expect(['reset_counter', 'no_change']).toContain(d.kind);
  });
});

describe('evaluatePromotion — guards', () => {
  test('destructive category never promotes', () => {
    const d = evaluatePromotion(
      {
        trustLevel: 'PROPOSE_ONLY',
        isDestructive: true,
        autoPromoteEligible: true,
        consecutiveCleanRuns: 100,
      },
      { cleanRuns30d: 100, reverts30d: 0 },
    );
    expect(d.kind).toBe('no_change');
    if (d.kind === 'no_change') {
      expect(d.reason).toBe('destructive_category');
    }
  });

  test('autoPromoteEligible=false opts out entirely', () => {
    const d = evaluatePromotion(
      {
        trustLevel: 'PROPOSE_ONLY',
        isDestructive: false,
        autoPromoteEligible: false,
        consecutiveCleanRuns: 100,
      },
      { cleanRuns30d: 100, reverts30d: 0 },
    );
    expect(d.kind).toBe('no_change');
    if (d.kind === 'no_change') {
      expect(d.reason).toBe('auto_promote_disabled');
    }
  });

  test('max_trust=AUTO_REVERSIBLE caps the promotion ladder', () => {
    const d = evaluatePromotion(
      {
        trustLevel: 'AUTO_REVERSIBLE',
        isDestructive: false,
        autoPromoteEligible: true,
        consecutiveCleanRuns: 100,
      },
      { cleanRuns30d: 100, reverts30d: 0 },
      'AUTO_REVERSIBLE',
    );
    expect(d.kind).toBe('no_change');
    if (d.kind === 'no_change') {
      expect(d.reason).toBe('already_at_max');
    }
  });

  test('max_trust=PROPOSE_ONLY blocks all promotions', () => {
    const d = evaluatePromotion(
      {
        trustLevel: 'PROPOSE_ONLY',
        isDestructive: false,
        autoPromoteEligible: true,
        consecutiveCleanRuns: 100,
      },
      { cleanRuns30d: 100, reverts30d: 0 },
      'PROPOSE_ONLY',
    );
    expect(d.kind).toBe('no_change');
  });
});

describe('notification formatting', () => {
  test('promotion to AUTO_REVERSIBLE uses the 20-run wording', () => {
    const s = formatPromotionNotification('menu', 'description.update', 'AUTO_REVERSIBLE');
    expect(s).toContain('agent menu');
    expect(s).toContain('description.update');
    expect(s).toContain('AUTO_REVERSIBLE');
    expect(s).toContain('20');
  });

  test('promotion to AUTO_FULL uses the 50-run wording', () => {
    const s = formatPromotionNotification('marketing', 'social.draft', 'AUTO_FULL');
    expect(s).toContain('AUTO_FULL');
    expect(s).toContain('50');
  });

  test('demotion notification includes the from/to and revert count', () => {
    const s = formatDemotionNotification('menu', 'description.update', 'AUTO_FULL', 'AUTO_REVERSIBLE', 5);
    expect(s).toContain('AUTO_FULL');
    expect(s).toContain('AUTO_REVERSIBLE');
    expect(s).toContain('5');
  });
});
