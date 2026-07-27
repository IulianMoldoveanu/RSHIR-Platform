// Characterization tests for the shared Hepy brain (classifier + WA
// formatter). These pin the EXACT behavior the classifier had while it lived
// inline in supabase/functions/telegram-command-intake/index.ts, so the
// extraction into _shared/hepy-brain.ts is provably non-regressing and both
// Telegram and WhatsApp get identical understanding.
//
// Vitest runs in Node; we import the Deno-compatible source directly (same
// pattern as analytics-intents.test.ts).

import { describe, expect, test, vi, afterEach } from 'vitest';
import {
  detectIntentRegex,
  classifyIntent,
  formatWhatsApp,
  buildPersonaPreamble,
} from '../../../../../supabase/functions/_shared/hepy-brain';

describe('detectIntentRegex — RO intent classification (characterization)', () => {
  test('orders_now — active orders phrasings', () => {
    expect(detectIntentRegex('cate comenzi am acum').intent).toBe('orders_now');
    expect(detectIntentRegex('comenzi active').intent).toBe('orders_now');
    expect(detectIntentRegex('câte comenzi am în desfășurare').intent).toBe('orders_now');
  });

  test('couriers_online', () => {
    expect(detectIntentRegex('cati curieri sunt online').intent).toBe('couriers_online');
    expect(detectIntentRegex('curieri disponibili').intent).toBe('couriers_online');
  });

  test('recommendations_today', () => {
    expect(detectIntentRegex('ce recomandari am azi').intent).toBe('recommendations_today');
    expect(detectIntentRegex('ce sugestii').intent).toBe('recommendations_today');
  });

  test('top_products defaults period to week', () => {
    const r = detectIntentRegex('top produse');
    expect(r.intent).toBe('top_products');
    expect(r.period).toBe('week');
  });

  test('top_products honors explicit period', () => {
    const r = detectIntentRegex('top preparate azi');
    expect(r.intent).toBe('top_products');
    expect(r.period).toBe('today');
  });

  test('orders_summary — "cum a mers" and period phrasings', () => {
    expect(detectIntentRegex('cum a mers azi').intent).toBe('orders_summary');
    const r = detectIntentRegex('cat venit am facut ieri');
    expect(r.intent).toBe('orders_summary');
    expect(r.period).toBe('yesterday');
  });

  test('diacritic-insensitive (owners type fără diacritice)', () => {
    // "câte" with diacritics normalizes to "cate" and still matches.
    expect(detectIntentRegex('CÂTE comenzi am acum'.toLowerCase()).intent).toBe('orders_now');
    // A bare period word with no intent verb is NOT an intent.
    expect(detectIntentRegex('saptamina').intent).toBe('NONE');
  });

  test('unrelated text → NONE', () => {
    expect(detectIntentRegex('salut ce faci').intent).toBe('NONE');
    expect(detectIntentRegex('').intent).toBe('NONE');
  });
});

describe('classifyIntent — regex-first, LLM fallback gated on ≥3 words', () => {
  afterEach(() => vi.restoreAllMocks());

  test('regex match never calls the LLM', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const r = await classifyIntent('cate comenzi am acum', 'sk-test');
    expect(r.intent).toBe('orders_now');
    expect(spy).not.toHaveBeenCalled();
  });

  test('short non-matching message skips the LLM (returns NONE)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const r = await classifyIntent('salut', 'sk-test'); // 1 word
    expect(r.intent).toBe('NONE');
    expect(spy).not.toHaveBeenCalled();
  });

  test('no anthropic key → LLM path returns NONE without fetching', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const r = await classifyIntent('as vrea sa stiu ceva vag', '');
    expect(r.intent).toBe('NONE');
    expect(spy).not.toHaveBeenCalled();
  });

  test('long non-matching message calls the LLM and maps its answer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ content: [{ text: 'INTENT=orders_summary PERIOD=week' }] }),
        { status: 200 },
      ),
    );
    const r = await classifyIntent('spune-mi te rog cum a evoluat businessul', 'sk-test');
    expect(r.intent).toBe('orders_summary');
    expect(r.period).toBe('week');
  });

  test('LLM returning an unknown intent is coerced to NONE', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ content: [{ text: 'INTENT=launch_rockets PERIOD=none' }] }), {
        status: 200,
      }),
    );
    const r = await classifyIntent('fa ceva complet aiurea acum te rog', 'sk-test');
    expect(r.intent).toBe('NONE');
  });
});

describe('formatWhatsApp', () => {
  test('converts Telegram HTML bold/italic to WhatsApp markers', () => {
    expect(formatWhatsApp('<b>Vânzări</b> azi: <i>500</i> RON')).toBe('*Vânzări* azi: _500_ RON');
  });

  test('strips unknown tags and converts <br> to newline', () => {
    expect(formatWhatsApp('linia1<br>linia2<span>x</span>')).toBe('linia1\nlinia2x');
  });

  test('hard-caps at 4096 chars with an ellipsis', () => {
    const long = 'a'.repeat(5000);
    const out = formatWhatsApp(long);
    expect(out.length).toBe(4096);
    expect(out.endsWith('…')).toBe(true);
  });

  test('short plain text passes through unchanged', () => {
    expect(formatWhatsApp('Aveți 3 comenzi active.')).toBe('Aveți 3 comenzi active.');
  });
});

describe('buildPersonaPreamble', () => {
  test('defaults to Hepi + neutral tone when nothing set', () => {
    const p = buildPersonaPreamble(null);
    expect(p).toContain('Ești Hepi,');
    expect(p).toContain('profesionist');
    expect(p).toContain('Nu inventezi date');
  });

  test('uses the configured name and tone', () => {
    const p = buildPersonaPreamble({ assistantName: 'Ana', personaTone: 'prietenos, direct' });
    expect(p).toContain('Ești Ana,');
    expect(p).toContain('Ton: prietenos, direct.');
  });

  test('trims empty/whitespace fields back to defaults', () => {
    const p = buildPersonaPreamble({ assistantName: '   ', personaTone: '' });
    expect(p).toContain('Ești Hepi,');
    expect(p).toContain('profesionist');
  });

  test('collapses whitespace and caps a long tone', () => {
    const longTone = 'x'.repeat(600);
    const p = buildPersonaPreamble({ assistantName: 'Chef', personaTone: `a\n\n  b   ${longTone}` });
    expect(p).toContain('Ești Chef,');
    // Tone is single-lined and length-capped (400) — the preamble stays bounded.
    expect(p.length).toBeLessThan(500);
    expect(p).not.toContain('\n');
  });
});
