// Tests for the CS Agent — Sprint 14.
//
// We don't hit Anthropic in unit tests; we test:
//  - schema validation against representative valid/invalid JSON shapes
//  - the hard guard `assertNotAutoPostingNegative` (defense in depth)
//  - empty-input shortcut for feedback digest (no token spend)
//
// Network calls would require a recorded fixture or live key; covered by
// the manual smoke run in the post-merge runbook.

import { describe, expect, test } from 'vitest';
import {
  reviewReplyOptionsSchema,
  complaintTemplateSchema,
  feedbackDigestSchema,
  assertNotAutoPostingNegative,
  generateFeedbackDigest,
  CsAgentError,
  COMPLAINT_TYPES,
  TONE_LABELS,
} from './cs-agent';

describe('reviewReplyOptionsSchema', () => {
  test('accepts a well-formed 3-option payload', () => {
    const valid = {
      options: [
        { tone: 'formal', text: 'Stimată Doamnă, vă mulțumim pentru aprecierea dumneavoastră privind serviciile noastre. Vă așteptăm cu drag la o nouă comandă.' },
        { tone: 'warm', text: 'Mulțumim mult pentru cuvintele frumoase! Ne bucurăm enorm că v-a plăcut și abia așteptăm să gătim din nou pentru dumneavoastră.' },
        { tone: 'direct', text: 'Mulțumim pentru recenzie. Vă așteptăm la următoarea comandă!' },
      ],
      sentiment: 'positive',
      confidence: 0.9,
    };
    const result = reviewReplyOptionsSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  test('rejects fewer than 3 options', () => {
    const invalid = {
      options: [
        { tone: 'formal', text: 'short reply with at least twenty chars please.' },
      ],
      sentiment: 'neutral',
      confidence: 0.5,
    };
    expect(reviewReplyOptionsSchema.safeParse(invalid).success).toBe(false);
  });

  test('rejects unknown tone', () => {
    const invalid = {
      options: [
        { tone: 'sarcastic', text: 'A long enough text to pass the min character requirement here.' },
        { tone: 'warm', text: 'Another long enough text to pass the min character requirement here.' },
        { tone: 'direct', text: 'Yet another long enough text to pass the min character requirement.' },
      ],
      sentiment: 'neutral',
      confidence: 0.5,
    };
    expect(reviewReplyOptionsSchema.safeParse(invalid).success).toBe(false);
  });

  test('rejects out-of-range confidence', () => {
    const invalid = {
      options: [
        { tone: 'formal', text: 'A long enough text to pass the min character requirement here.' },
        { tone: 'warm', text: 'Another long enough text to pass the min character requirement here.' },
        { tone: 'direct', text: 'Yet another long enough text to pass the min character requirement.' },
      ],
      sentiment: 'positive',
      confidence: 1.5,
    };
    expect(reviewReplyOptionsSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('complaintTemplateSchema', () => {
  test('accepts well-formed 3-option payload', () => {
    const valid = {
      options: [
        { tone: 'formal', text: 'Vă rugăm să primiți scuzele noastre sincere pentru această experiență neplăcută.', suggested_compensation: 'Refund integral' },
        { tone: 'warm', text: 'Îmi pare extrem de rău că ați avut această experiență — am verificat și vom remedia situația.', suggested_compensation: 'Reducere 20% la următoarea comandă' },
        { tone: 'direct', text: 'Refund integral procesat în 24h. Vă mulțumim pentru semnalare.', suggested_compensation: 'Refund integral procesat azi' },
      ],
    };
    expect(complaintTemplateSchema.safeParse(valid).success).toBe(true);
  });

  test('rejects when compensation is missing', () => {
    const invalid = {
      options: [
        { tone: 'formal', text: 'Long enough body text to pass the minimum character requirement here.' },
        { tone: 'warm', text: 'Long enough body text to pass the minimum character requirement here.' },
        { tone: 'direct', text: 'Long enough body text to pass the minimum character requirement here.' },
      ],
    };
    expect(complaintTemplateSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('feedbackDigestSchema', () => {
  test('accepts a complete digest', () => {
    const valid = {
      top_praised: ['Servicii rapide', 'Mâncare de calitate'],
      top_complaints: ['Livrare târzie după 21'],
      sentiment: { trend: 'improving', score: 0.6 },
      action_items: ['Verificați programul curierilor după ora 21', 'Adăugați 2 desserts noi'],
    };
    expect(feedbackDigestSchema.safeParse(valid).success).toBe(true);
  });

  test('accepts an empty digest', () => {
    const valid = {
      top_praised: [],
      top_complaints: [],
      sentiment: { trend: 'unknown', score: 0 },
      action_items: [],
    };
    expect(feedbackDigestSchema.safeParse(valid).success).toBe(true);
  });

  test('rejects out-of-range sentiment score', () => {
    const invalid = {
      top_praised: [],
      top_complaints: [],
      sentiment: { trend: 'improving', score: 2.5 },
      action_items: [],
    };
    expect(feedbackDigestSchema.safeParse(invalid).success).toBe(false);
  });

  test('rejects more than 3 top_praised', () => {
    const invalid = {
      top_praised: ['a', 'b', 'c', 'd'],
      top_complaints: [],
      sentiment: { trend: 'stable', score: 0 },
      action_items: [],
    };
    expect(feedbackDigestSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('assertNotAutoPostingNegative', () => {
  test('PROPOSE_ONLY: never throws regardless of rating/sentiment (OWNER in loop)', () => {
    expect(() =>
      assertNotAutoPostingNegative({ rating: 1, sentiment: 'negative', trustLevel: 'PROPOSE_ONLY' }),
    ).not.toThrow();
    expect(() =>
      assertNotAutoPostingNegative({ rating: 5, sentiment: 'positive', trustLevel: 'PROPOSE_ONLY' }),
    ).not.toThrow();
  });

  test('AUTO_REVERSIBLE: throws on low rating', () => {
    expect(() =>
      assertNotAutoPostingNegative({ rating: 2, sentiment: 'positive', trustLevel: 'AUTO_REVERSIBLE' }),
    ).toThrow(CsAgentError);
  });

  test('AUTO_REVERSIBLE: throws on negative sentiment even with high rating', () => {
    // Edge case: sarcastic 5★ where text is in fact negative.
    expect(() =>
      assertNotAutoPostingNegative({ rating: 5, sentiment: 'negative', trustLevel: 'AUTO_REVERSIBLE' }),
    ).toThrow(CsAgentError);
  });

  test('AUTO_FULL: still blocked on low rating', () => {
    // Defense in depth — even AUTO_FULL cannot escape the rule.
    expect(() =>
      assertNotAutoPostingNegative({ rating: 1, sentiment: 'neutral', trustLevel: 'AUTO_FULL' }),
    ).toThrow(CsAgentError);
  });

  test('AUTO_REVERSIBLE: passes for genuine 5★ positive review', () => {
    expect(() =>
      assertNotAutoPostingNegative({ rating: 5, sentiment: 'positive', trustLevel: 'AUTO_REVERSIBLE' }),
    ).not.toThrow();
  });

  test('AUTO_REVERSIBLE: passes for 4★ positive review', () => {
    expect(() =>
      assertNotAutoPostingNegative({ rating: 4, sentiment: 'positive', trustLevel: 'AUTO_REVERSIBLE' }),
    ).not.toThrow();
  });

  test('AUTO_REVERSIBLE: blocks 3★ neutral review (boundary)', () => {
    // 3★ is the boundary — guard treats <= 3 as blocked.
    expect(() =>
      assertNotAutoPostingNegative({ rating: 3, sentiment: 'neutral', trustLevel: 'AUTO_REVERSIBLE' }),
    ).toThrow(CsAgentError);
  });
});

describe('generateFeedbackDigest — empty input shortcut', () => {
  test('returns deterministic empty digest without calling Claude when no data', async () => {
    // No API key set in test env — if this calls Claude it throws. The
    // shortcut path means it does NOT call Claude.
    const result = await generateFeedbackDigest({
      tenantName: 'Test SRL',
      weekIso: '2026-W01',
      reviews: [],
      chatMessages: [],
    });
    expect(result.top_praised).toEqual([]);
    expect(result.top_complaints).toEqual([]);
    expect(result.sentiment.trend).toBe('unknown');
    expect(result.action_items.length).toBeGreaterThan(0); // friendly nudge
  });
});

describe('public constants', () => {
  test('all complaint types have a label', () => {
    expect(COMPLAINT_TYPES).toHaveLength(6);
    for (const c of COMPLAINT_TYPES) {
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  test('all tone keys have labels', () => {
    expect(TONE_LABELS.formal).toBeTruthy();
    expect(TONE_LABELS.warm).toBeTruthy();
    expect(TONE_LABELS.direct).toBeTruthy();
  });
});
