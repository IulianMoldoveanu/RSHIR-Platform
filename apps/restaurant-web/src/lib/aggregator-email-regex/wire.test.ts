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
//
// Codex P2 (2nd pass) #315: a 'medium' result with missing.length===0
// (i.e. drift-only — every field present, totals just don't balance)
// MUST fall back to 'ai-full', otherwise the gap-fill prompt has no
// keys to fill and the inconsistent totals stay uncorrected.
//
// Codex P1 #315: a 'high' result that lacks external_order_id MUST
// downgrade to 'regex+ai-fill' so AI recovers the dedup key and
// auto-apply works.
function pickStrategy(emailBody: string, source: 'GLOVO' | 'WOLT' | 'BOLT_FOOD'): ParseStrategy {
  const r = tryRegexParse(emailBody, source);
  if (!r.ok) return 'ai-full';
  if (r.confidence === 'high') {
    if (r.missing.includes('external_order_id')) return 'regex+ai-fill';
    return 'regex';
  }
  // medium
  if (r.missing.length === 0) return 'ai-full';
  return 'regex+ai-fill';
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

// Drift-only medium: every field present, but totals don't balance.
// Per Codex P2 #315 this must fall back to ai-full.
const GLOVO_DRIFTED_NO_MISSING = GLOVO_HIGH.replace(
  'Total: 109,00 RON',
  'Total: 200,00 RON',
);

// True-gap medium: total line is absent → total_ron=null →
// autoApplyReady=false → confidence='medium' AND missing includes
// 'total_ron' (non-empty). Items + subtotal still extracted so the
// gap-fill prompt can usefully ask Anthropic to recover the total.
const GLOVO_MEDIUM_NO_TOTAL = `From: Glovo Romania <noreply@glovoapp.com>
Subject: Comanda noua #G555

Comanda noua #G555
Client: Maria Ionescu
Telefon: 0723456789
Adresa: Strada Lunga 14, Brasov

2 × Pizza Margherita — 30,00 RON

Subtotal: 60,00 RON
Livrare: 6,00 RON
`;

// High-confidence body but no order-id → must downgrade to regex+ai-fill
// so Anthropic recovers external_order_id (Codex P1 #315). Built from
// scratch so no stray #ID pattern leaks through.
const GLOVO_HIGH_NO_ORDER_ID = `From: Glovo Romania <noreply@glovoapp.com>
Subject: Comanda noua

Client: Andrei Popescu
Telefon: +40 712 345 678
Adresa: Strada Victoriei 12, Brasov

2 × Pizza Quattro Stagioni — 39,50 RON
1 × Tiramisu Casa — 22,00 RON

Subtotal: 101,00 RON
Livrare: 8,00 RON
Total: 109,00 RON
`;

const NON_ORDER = `Buna ziua,
Va trimitem un mesaj informativ. Nu este o comanda.
Multumim.
`;

describe('parser strategy decision tree (wire contract)', () => {
  it('high-confidence regex output → strategy = regex (zero AI cost)', () => {
    const s = pickStrategy(GLOVO_HIGH, 'GLOVO');
    expect(s).toBe('regex');
  });

  it('high-confidence but missing external_order_id → regex+ai-fill (Codex P1 #315)', () => {
    // Sanity-check the fixture: regex must report external_order_id missing.
    const r = tryRegexParse(GLOVO_HIGH_NO_ORDER_ID, 'GLOVO');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.missing).toContain('external_order_id');
    const s = pickStrategy(GLOVO_HIGH_NO_ORDER_ID, 'GLOVO');
    expect(s).toBe('regex+ai-fill');
  });

  it('medium-confidence with at least one missing field → regex+ai-fill', () => {
    // Sanity: classifier downgrades because total_ron is null. Gap-fill
    // is genuinely useful — Anthropic recovers the missing total.
    const r = tryRegexParse(GLOVO_MEDIUM_NO_TOTAL, 'GLOVO');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.confidence).toBe('medium');
    expect(r.missing.length).toBeGreaterThan(0);
    expect(r.missing).toContain('total_ron');
    const s = pickStrategy(GLOVO_MEDIUM_NO_TOTAL, 'GLOVO');
    expect(s).toBe('regex+ai-fill');
  });

  it('medium-confidence with empty missing[] (drift-only) → ai-full (Codex P2 #315)', () => {
    // Sanity: drift-only fixture has every field present but totals
    // misaligned. The classifier downgrades to medium and missing[] is
    // empty — gap-fill would be a no-op so we MUST fall back to full AI.
    const r = tryRegexParse(GLOVO_DRIFTED_NO_MISSING, 'GLOVO');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.confidence).toBe('medium');
    expect(r.missing.length).toBe(0);
    const s = pickStrategy(GLOVO_DRIFTED_NO_MISSING, 'GLOVO');
    expect(s).toBe('ai-full');
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
