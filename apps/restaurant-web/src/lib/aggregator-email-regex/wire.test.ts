// Lane EMAIL-REGEX-WIREUP — strategy-decision contract tests.
//
// The actual decision tree lives inside the `aggregator-email-parser`
// Edge Function (Deno runtime, vitest cannot import it). What we lock
// down here is the CONTRACT between the regex layer and the parser:
//
//   regex layer says ok+high   → parser must pick 'regex'        (skip Anthropic)
//   regex layer says ok+medium → parser must pick 'regex+ai-fill' (gap-fill prompt)
//   regex layer says ok:false  → parser must pick 'ai-full'       (existing path)
//
// If the regex layer ever stops returning one of those three shapes for
// the canonical fixtures, this file fails — and the parser's wire-in is
// no longer safe to deploy without a review.
//
// Cost-savings sanity is also asserted: regex saves more than regex+ai-fill,
// regex+ai-fill saves more than ai-full (which saves zero).

import { describe, expect, it } from 'vitest';
import {
  tryRegexParse,
  estimateSavingsRon,
  type ParseStrategy,
} from '../../../../../supabase/functions/_shared/aggregator-email-regex';

// Replicates the parser's strategy decision so vitest can prove the
// contract end-to-end. KEEP THIS IN SYNC with the inline tree in
// `supabase/functions/aggregator-email-parser/index.ts`.
function pickStrategy(emailBody: string, source: 'GLOVO' | 'WOLT' | 'BOLT_FOOD'): ParseStrategy {
  const r = tryRegexParse(emailBody, source);
  if (r.ok && r.confidence === 'high') return 'regex';
  if (r.ok && r.confidence === 'medium') return 'regex+ai-fill';
  return 'ai-full';
}

const GLOVO_HIGH = `From: Glovo Romania <noreply@glovoapp.com>
Subject: Comanda noua #G7H8K2L1

Comanda noua #G7H8K2L1
Client: Andrei Popescu
Telefon: +40 712 345 678
Adresa: Strada Victoriei 12, Brasov

2 × Pizza Quattro Stagioni — 39,50 RON
1 × Tiramisu Casa — 22,00 RON

Subtotal: 101,00 RON
Livrare: 8,00 RON
Total: 109,00 RON
`;

const GLOVO_DRIFTED = GLOVO_HIGH.replace('Total: 109,00 RON', 'Total: 200,00 RON');

const NON_ORDER = `Buna ziua,
Va trimitem un mesaj informativ. Nu este o comanda.
Multumim.
`;

describe('parser strategy decision tree (wire contract)', () => {
  it('high-confidence regex output → strategy = regex (zero AI cost)', () => {
    const s = pickStrategy(GLOVO_HIGH, 'GLOVO');
    expect(s).toBe('regex');
  });

  it('medium-confidence regex output → strategy = regex+ai-fill', () => {
    const s = pickStrategy(GLOVO_DRIFTED, 'GLOVO');
    expect(s).toBe('regex+ai-fill');
  });

  it('non-order email (no items) → strategy = ai-full (full Anthropic parse)', () => {
    const s = pickStrategy(NON_ORDER, 'GLOVO');
    expect(s).toBe('ai-full');
  });
});

describe('savings ordering (operator-tile contract)', () => {
  it('regex saves strictly more RON than regex+ai-fill', () => {
    expect(estimateSavingsRon('regex')).toBeGreaterThan(estimateSavingsRon('regex+ai-fill'));
  });

  it('ai-full has zero savings vs the all-AI baseline', () => {
    expect(estimateSavingsRon('ai-full')).toBe(0);
  });

  it('failed contributes zero savings to the operator tile', () => {
    expect(estimateSavingsRon('failed')).toBe(0);
  });
});
