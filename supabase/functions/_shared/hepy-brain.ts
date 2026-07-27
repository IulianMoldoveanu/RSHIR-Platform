// Shared "Hepy brain" — channel-neutral intent understanding + reply
// formatting, so the Telegram webhook and the WhatsApp webhook run the SAME
// classifier instead of two divergent copies.
//
// IMPORTANT: like _shared/whatsapp.ts, this file MUST stay free of Deno
// globals (Deno.env, Deno.serve) and Node globals (node:crypto). Web-standard
// APIs only (fetch, TextEncoder) — so it runs in both Deno (Edge Functions)
// and Node 22 (vitest). That is what makes the classifier unit-testable
// without booting Deno.
//
// 2026-07-28 — extracted verbatim from telegram-command-intake/index.ts
// (detectIntentRegex + classifyIntentLLM). Behavior is intentionally
// identical to the pre-extraction Telegram code; the characterization test
// in hepy-brain.test.ts pins that behavior so the extraction is provably
// non-regressing.

export type HepyIntent =
  | 'orders_summary' // "cum a mers azi/ieri/saptamana/luna"
  | 'top_products' // "top produse [perioada]"
  | 'orders_now' // "cate comenzi am acum"
  | 'couriers_online' // "cati curieri sunt online"
  | 'recommendations_today' // "ce recomandari am azi"
  | 'NONE';

export type HepyPeriod = 'today' | 'yesterday' | 'week' | 'month';

export type ClassifiedIntent = { intent: HepyIntent; period?: HepyPeriod };

// ────────────────────────────────────────────────────────────
// Zero-cost regex intent classifier. RO-aware, strips diacritics (owners
// often type fără diacritice). Returns NONE when nothing matches — the
// caller decides whether to fall through to the LLM classifier.
// ────────────────────────────────────────────────────────────
export function detectIntentRegex(text: string): ClassifiedIntent {
  // Strip diacritics for matching (Iulian sometimes types fără diacritice).
  const t = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

  let period: HepyPeriod | undefined;
  if (/\b(azi|astazi|today)\b/.test(t)) period = 'today';
  else if (/\b(ieri|yesterday)\b/.test(t)) period = 'yesterday';
  else if (/\b(saptamana|saptamina|week|7\s*zile)\b/.test(t)) period = 'week';
  else if (/\b(luna|lunii|month|30\s*zile)\b/.test(t)) period = 'month';

  if (/\bcate\s+comenzi\s+am\s+(acum|in\s+desfasurare|active)\b/.test(t) || /\bcomenzi\s+(acum|active|in\s+lucru)\b/.test(t)) {
    return { intent: 'orders_now' };
  }
  if (/\bcati\s+curieri\b/.test(t) || /\bcurieri\s+(online|activi|disponibili)\b/.test(t)) {
    return { intent: 'couriers_online' };
  }
  if (/\b(recomandari|sugestii|sfaturi)\b.*\b(azi|astazi|today|recent)\b/.test(t) || /\bce\s+(recomandari|sugestii)\b/.test(t)) {
    return { intent: 'recommendations_today' };
  }
  if (/\btop\s+(produse|preparate|items?)\b/.test(t) || /\b(cele\s+mai\s+vandute|bestsellers?)\b/.test(t)) {
    return { intent: 'top_products', period: period ?? 'week' };
  }
  if (/\bcum\s+a\s+mers\b/.test(t) || /\b(cifra|incasari|venit|comenzi)\b.*\b(azi|ieri|saptamana|luna)\b/.test(t) || (/\b(azi|ieri|saptamana|luna)\b/.test(t) && /\b(cum|cat)\b/.test(t))) {
    return { intent: 'orders_summary', period: period ?? 'today' };
  }
  return { intent: 'NONE' };
}

// ────────────────────────────────────────────────────────────
// LLM fallback classifier (Anthropic). Pure classifier — returns an intent
// name, never prose. Caller should only invoke this when detectIntentRegex
// returned NONE and the message is long enough to be worth the round-trip.
// ────────────────────────────────────────────────────────────
export async function classifyIntentLLM(
  text: string,
  anthropicKey: string,
): Promise<ClassifiedIntent> {
  if (!anthropicKey) return { intent: 'NONE' };
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 60,
        system: `You are an intent classifier for a Romanian restaurant ops bot. Map the user's message to ONE intent name from this list, or NONE.
Intents:
- orders_summary  (asks about how a period went; needs period: today|yesterday|week|month)
- top_products    (asks for best-selling items; needs period)
- orders_now      (asks about active/in-progress orders right now)
- couriers_online (asks how many couriers are online/available)
- recommendations_today (asks for AI growth recommendations)
- NONE (anything else, including general questions)

Reply with EXACTLY one line and nothing else:
INTENT=<name> PERIOD=<today|yesterday|week|month|none>`,
        messages: [{ role: 'user', content: text }],
      }),
    });
    if (!r.ok) return { intent: 'NONE' };
    const j = await r.json();
    const out: string = j.content?.[0]?.text || '';
    const m = out.match(/INTENT=(\w+)\s+PERIOD=(\w+)/i);
    if (!m) return { intent: 'NONE' };
    const intent = m[1].toLowerCase() as HepyIntent;
    const periodRaw = m[2].toLowerCase();
    const allowed: HepyIntent[] = ['orders_summary', 'top_products', 'orders_now', 'couriers_online', 'recommendations_today', 'NONE'];
    if (!allowed.includes(intent)) return { intent: 'NONE' };
    const period = (['today', 'yesterday', 'week', 'month'].includes(periodRaw) ? periodRaw : undefined) as HepyPeriod | undefined;
    return { intent, period };
  } catch (e) {
    console.warn('classifyIntentLLM fail', (e as Error).message);
    return { intent: 'NONE' };
  }
}

// ────────────────────────────────────────────────────────────
// Combined classifier: regex first (zero cost), LLM fallback only when
// regex is NONE and the message has ≥3 words (matches the Telegram
// threshold at telegram-command-intake/index.ts). Channel-neutral.
// ────────────────────────────────────────────────────────────
export async function classifyIntent(
  text: string,
  anthropicKey: string,
): Promise<ClassifiedIntent> {
  const regex = detectIntentRegex(text);
  if (regex.intent !== 'NONE') return regex;
  if (text.trim().split(/\s+/).length < 3) return { intent: 'NONE' };
  return classifyIntentLLM(text, anthropicKey);
}

// ────────────────────────────────────────────────────────────
// Per-channel reply formatting. The read handlers produce plain text with
// simple markers; Telegram renders HTML, WhatsApp renders its own light
// markup with a hard 4096-char cap (Meta's text message limit).
// ────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────
// Configurable persona. Owners set an assistant name + tone per tenant
// (tenant_hepi_persona table); this turns those two fields into a system-
// prompt preamble. Both optional — empty inputs yield the default persona.
// Pure + channel-neutral so it's unit-testable and shared by every surface
// that composes a Hepi reply.
// ────────────────────────────────────────────────────────────

export type HepiPersona = {
  assistantName?: string | null;
  personaTone?: string | null;
};

const DEFAULT_ASSISTANT_NAME = 'Hepi';
// Keep injected free-text bounded so a persona field can't blow the prompt.
const MAX_TONE_CHARS = 400;

/** Build the persona preamble injected at the top of a Hepi reply prompt.
 *  Falls back to "Hepi" + a neutral-professional tone when unset. The tone
 *  is sanitized (single-line, length-capped) since it's owner free text. */
export function buildPersonaPreamble(persona?: HepiPersona | null): string {
  const name = (persona?.assistantName ?? '').trim() || DEFAULT_ASSISTANT_NAME;
  const toneRaw = (persona?.personaTone ?? '').trim();
  const tone = toneRaw
    .replace(/\s+/g, ' ')
    .slice(0, MAX_TONE_CHARS)
    .trim();
  const toneLine = tone
    ? `Ton: ${tone}.`
    : 'Ton: profesionist, prietenos, concis, în română.';
  return [
    `Ești ${name}, asistentul AI al acestui restaurant.`,
    toneLine,
    'Nu inventezi date pe care nu le ai.',
  ].join(' ');
}

/** WhatsApp text: strip any HTML tags a Telegram-shaped string might carry,
 *  and hard-cap at 4096 chars (Meta limit). Bold uses *asterisks* on WA. */
export function formatWhatsApp(text: string): string {
  const noHtml = text
    .replace(/<\/?b>/gi, '*')
    .replace(/<\/?strong>/gi, '*')
    .replace(/<\/?i>/gi, '_')
    .replace(/<br\s*\/?>(?:\n)?/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return noHtml.length > 4096 ? noHtml.slice(0, 4095) + '…' : noHtml;
}
