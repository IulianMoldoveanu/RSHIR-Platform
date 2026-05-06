// Lane AGGREGATOR-EMAIL-REGEX-HYBRID — regex pre-parse layer.
//
// Sits in front of the Anthropic call inside `aggregator-email-parser`.
// For ~95% of well-formed Glovo / Wolt / Bolt Food order-confirmation
// emails the layout is templated and a pure regex pass extracts every
// field we need. Anthropic is reserved for partial extracts (some fields
// missing → fill the gaps) and the long tail of unrecognized layouts.
//
// Cost framing (used for the operator-facing savings tile):
//   - Anthropic full parse  ≈ 0.0025-0.0040 USD / email (claude-sonnet-4-5
//     at ~5k input + ~400 output tokens given the 12 KB body cap).
//   - Anthropic gap-fill    ≈ 0.0008-0.0012 USD / email (~1.5k input +
//     ~150 output, 3-5 missing fields shown as JSON sketch).
//   - Pure regex            ≈ 0 USD (Edge Function CPU only).
// At 200 jobs/day/tenant cap × 30 days × 0.0035 USD ≈ 21 USD/tenant/month
// at 100% AI; the hybrid path drops that to ~1-2 USD on a templated feed.
//
// ADDITIVE only. Pure module — no Deno.* / no network / no Supabase.
// Side-effect free; safe to import from any runtime (Edge Function, Node
// test runner, Vitest). All extractors run in O(body length).

// ─── Types ────────────────────────────────────────────────────────────

export type AggregatorSource = 'GLOVO' | 'WOLT' | 'BOLT_FOOD';

/** Mirrors the Anthropic JSON schema in `aggregator-email-parser`. */
export interface ParsedOrder {
  external_order_id: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unit_price_ron?: number | null;
    modifiers?: string | null;
  }>;
  subtotal_ron: number | null;
  delivery_fee_ron: number | null;
  total_ron: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  scheduled_for: string | null;
  notes: string | null;
}

/** Result of a regex extraction attempt. */
export type ParseResult =
  | {
      ok: true;
      data: ParsedOrder;
      /**
       * - `high`   = every field that drives auto-apply is present
       *             (items[], subtotal_ron, total_ron, and total_ron
       *             ≈ subtotal+delivery within 5%). Caller skips AI.
       * - `medium` = items[] + total_ron extracted but at least one
       *             other field is missing. Caller calls AI with a
       *             gap-fill prompt seeded by `data` + `missing`.
       */
      confidence: 'high' | 'medium';
      missing: string[];
    }
  | { ok: false; reason: string };

// ─── Helpers ──────────────────────────────────────────────────────────

/** Normalize the email body for regex matching. We keep multi-space
 *  runs intact because some templates (Wolt) use 2+ spaces as a column
 *  separator between item name and price. We only normalize newlines,
 *  collapse tabs to a single space, and replace non-breaking spaces.
 */
function normalize(body: string): string {
  return body
    .replace(/\r\n/g, '\n')
    .replace(/ /g, ' ') // nbsp
    .replace(/\t+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

/** Parse a Romanian/European number: "39,50" or "39.50" → 39.5. */
function parseAmount(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Match the first capture group across an ordered list of patterns. */
function firstMatch(body: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = body.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

/** Match the first amount across patterns, parsed as RON. */
function firstAmount(body: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = body.match(re);
    if (m && m[1]) {
      const n = parseAmount(m[1]);
      if (n != null) return n;
    }
  }
  return null;
}

/** Confidence classification — auto-apply criteria match the parser's. */
function classify(p: ParsedOrder): { confidence: 'high' | 'medium'; missing: string[] } {
  const missing: string[] = [];
  if (!p.external_order_id) missing.push('external_order_id');
  if (!p.items.length) missing.push('items');
  if (p.subtotal_ron == null) missing.push('subtotal_ron');
  if (p.delivery_fee_ron == null) missing.push('delivery_fee_ron');
  if (p.total_ron == null) missing.push('total_ron');
  if (!p.customer_name) missing.push('customer_name');
  if (!p.customer_phone) missing.push('customer_phone');
  if (!p.delivery_address) missing.push('delivery_address');

  // High requires the auto-apply set: items, subtotal, total, drift ≤ 5%.
  const autoApplyReady =
    p.items.length > 0 &&
    p.subtotal_ron != null &&
    p.total_ron != null &&
    p.total_ron > 0 &&
    Math.abs(p.total_ron - (p.subtotal_ron + (p.delivery_fee_ron ?? 0))) / p.total_ron <= 0.05;

  return { confidence: autoApplyReady ? 'high' : 'medium', missing };
}

// ─── Per-source extractors ────────────────────────────────────────────

interface SourcePatterns {
  orderId: RegExp[];
  subtotal: RegExp[];
  deliveryFee: RegExp[];
  total: RegExp[];
  customerName: RegExp[];
  customerPhone: RegExp[];
  address: RegExp[];
  /** Item line regex — must capture (qty)(name)(price). Tried in order. */
  itemLines: RegExp[];
  /** scheduled_for / pickup time, if present. */
  scheduledFor: RegExp[];
}

const RON_TAIL = '(?:RON|lei|Lei|LEI)?';
const NUM = '(\\d{1,5}(?:[.,]\\d{1,2})?)';

const GLOVO: SourcePatterns = {
  orderId: [
    /Comand[ăa]\s+(?:nou[ăa]\s+)?#\s*([A-Z0-9-]{4,})/i,
    /Order\s*(?:ID|number|nr\.?)\s*[:#]?\s*([A-Z0-9-]{4,})/i,
    /#\s*([A-Z0-9-]{6,})\s*[—\-]/i,
  ],
  subtotal: [
    new RegExp(`Subtotal\\s*[:.]?\\s*${NUM}\\s*${RON_TAIL}`, 'i'),
    new RegExp(`Total\\s*produse\\s*[:.]?\\s*${NUM}\\s*${RON_TAIL}`, 'i'),
  ],
  deliveryFee: [
    new RegExp(`(?:Livrare|Delivery|Taxa\\s+livrare)\\s*[:.]?\\s*${NUM}\\s*${RON_TAIL}`, 'i'),
  ],
  total: [
    new RegExp(`(?:^|\\n)\\s*Total(?:\\s+general|\\s+de\\s+plat[ăa])?\\s*[:.]?\\s*${NUM}\\s*${RON_TAIL}`, 'i'),
  ],
  customerName: [
    /Client[ăa]?\s*[:.]?\s*([A-ZĂÂÎȘȚ][\p{L} -]{1,60})/u,
    /Customer\s*[:.]?\s*([A-Z][\p{L} -]{1,60})/u,
    /Nume\s+client\s*[:.]?\s*([A-ZĂÂÎȘȚ][\p{L} -]{1,60})/u,
  ],
  customerPhone: [
    /(?:Telefon|Phone|Tel\.?)\s*[:.]?\s*(\+?40[\s\-]?\d(?:[\s\-]?\d){8})/i,
    /(?:Telefon|Phone|Tel\.?)\s*[:.]?\s*(0\d(?:[\s\-]?\d){8})/i,
  ],
  address: [
    /(?:Adres[ăa]|Delivery\s+address|Livrare\s+la)\s*[:.]?\s*([^\n]{6,200})/i,
  ],
  itemLines: [
    // "2 × Pizza Quattro Stagioni — 39,50 RON"
    /^\s*(\d{1,2})\s*[x×]\s+([^\n]{1,120}?)\s+[—\-]\s+(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:RON|lei)?\s*$/gim,
    // "2x Pizza ... 39,50"
    /^\s*(\d{1,2})\s*x\s+([^\n]{1,120}?)\s+(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:RON|lei)?\s*$/gim,
  ],
  scheduledFor: [
    /(?:Programat[ăa]\s+pentru|Scheduled\s+for|Livrare\s+la\s+ora)\s*[:.]?\s*([^\n]{4,40})/i,
  ],
};

const WOLT: SourcePatterns = {
  orderId: [
    /Order\s+#?\s*([A-Z0-9]{6,})/i,
    /Comand[ăa]\s*#\s*([A-Z0-9]{4,})/i,
    /Order\s+ID\s*[:#]?\s*([A-Z0-9-]{4,})/i,
  ],
  subtotal: [
    new RegExp(`Subtotal\\s*[:.]?\\s*${NUM}\\s*${RON_TAIL}`, 'i'),
    new RegExp(`Items?\\s+total\\s*[:.]?\\s*${NUM}\\s*${RON_TAIL}`, 'i'),
  ],
  deliveryFee: [
    new RegExp(`Delivery\\s+fee\\s*[:.]?\\s*${NUM}\\s*${RON_TAIL}`, 'i'),
    new RegExp(`Taxa\\s+livrare\\s*[:.]?\\s*${NUM}\\s*${RON_TAIL}`, 'i'),
  ],
  total: [
    new RegExp(`(?:^|\\n)\\s*Total(?:\\s+to\\s+pay|\\s+de\\s+plat[ăa])?\\s*[:.]?\\s*${NUM}\\s*${RON_TAIL}`, 'i'),
  ],
  customerName: [
    /Customer\s*[:.]?\s*([A-Z][\p{L} -]{1,60})/u,
    /Client[ăa]?\s*[:.]?\s*([A-ZĂÂÎȘȚ][\p{L} -]{1,60})/u,
  ],
  customerPhone: [
    /(?:Phone|Telefon)\s*[:.]?\s*(\+?40[\s\-]?\d(?:[\s\-]?\d){8})/i,
    /(?:Phone|Telefon)\s*[:.]?\s*(0\d(?:[\s\-]?\d){8})/i,
  ],
  address: [
    /(?:Delivery\s+address|Adres[ăa])\s*[:.]?\s*([^\n]{6,200})/i,
  ],
  itemLines: [
    // "1 × Burger Classic   42.00 RON"
    /^\s*(\d{1,2})\s*[x×]\s+([^\n]{1,120}?)\s{2,}(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:RON|lei)?\s*$/gim,
    // "1x Item ... 42.00"
    /^\s*(\d{1,2})\s*x\s+([^\n]{1,120}?)\s+(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:RON|lei)?\s*$/gim,
  ],
  scheduledFor: [
    /(?:Pickup\s+time|Scheduled\s+for|Programat[ăa]\s+pentru)\s*[:.]?\s*([^\n]{4,40})/i,
  ],
};

const BOLT_FOOD: SourcePatterns = {
  orderId: [
    /Order\s+#?\s*([A-Z0-9-]{4,})/i,
    /Comand[ăa]\s*#?\s*([A-Z0-9-]{4,})/i,
  ],
  subtotal: [
    new RegExp(`Subtotal\\s*[:.]?\\s*${NUM}\\s*${RON_TAIL}`, 'i'),
    new RegExp(`Total\\s+produse\\s*[:.]?\\s*${NUM}\\s*${RON_TAIL}`, 'i'),
  ],
  deliveryFee: [
    new RegExp(`(?:Delivery|Livrare|Taxa\\s+livrare)\\s*[:.]?\\s*${NUM}\\s*${RON_TAIL}`, 'i'),
  ],
  total: [
    new RegExp(`(?:^|\\n)\\s*Total(?:\\s+de\\s+plat[ăa]|\\s+to\\s+pay)?\\s*[:.]?\\s*${NUM}\\s*${RON_TAIL}`, 'i'),
  ],
  customerName: [
    /(?:Client[ăa]?|Customer)\s*[:.]?\s*([A-ZĂÂÎȘȚA-Z][\p{L} -]{1,60})/u,
  ],
  customerPhone: [
    /(?:Telefon|Phone|Tel\.?)\s*[:.]?\s*(\+?40[\s\-]?\d(?:[\s\-]?\d){8})/i,
    /(?:Telefon|Phone|Tel\.?)\s*[:.]?\s*(0\d(?:[\s\-]?\d){8})/i,
  ],
  address: [
    /(?:Adres[ăa]\s+livrare|Delivery\s+address|Adres[ăa])\s*[:.]?\s*([^\n]{6,200})/i,
  ],
  itemLines: [
    // Bolt body uses tabs / spaces, qty trailing or leading. Catch both.
    /^\s*(\d{1,2})\s*[x×]\s+([^\n]{1,120}?)\s+(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:RON|lei)?\s*$/gim,
    /^\s*(\d{1,2})\s*x\s+([^\n]{1,120}?)\s+(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:RON|lei)?\s*$/gim,
  ],
  scheduledFor: [
    /(?:Programat[ăa]\s+pentru|Scheduled\s+for|Pickup\s+time)\s*[:.]?\s*([^\n]{4,40})/i,
  ],
};

const PATTERNS: Record<AggregatorSource, SourcePatterns> = {
  GLOVO,
  WOLT,
  BOLT_FOOD,
};

// ─── Item extraction ──────────────────────────────────────────────────

function extractItems(body: string, patterns: SourcePatterns): ParsedOrder['items'] {
  const seen = new Set<string>();
  const items: ParsedOrder['items'] = [];
  for (const re of patterns.itemLines) {
    // Each iteration creates a fresh exec state with /g flag.
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = r.exec(body)) !== null) {
      const qty = parseInt(m[1], 10);
      const name = (m[2] ?? '').trim();
      const price = parseAmount(m[3]);
      if (!Number.isFinite(qty) || qty <= 0 || !name) continue;
      // Filter obvious accidental matches: lines that are price-only, totals, etc.
      if (/^total|^subtotal|^delivery|^livrare|^taxa|^subtotal/i.test(name)) continue;
      const key = `${qty}|${name.toLowerCase()}|${price ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        name,
        quantity: qty,
        unit_price_ron: price ?? null,
        modifiers: null,
      });
    }
    if (items.length > 0) break; // first pattern that yields items wins
  }
  return items;
}

// ─── Public entry ─────────────────────────────────────────────────────

/**
 * Try to extract a `ParsedOrder` from the email body using per-source
 * regex tables. Never throws.
 *
 * Returns:
 *   - `ok:true, confidence:'high'`   → caller can skip Anthropic entirely
 *   - `ok:true, confidence:'medium'` → caller should call Anthropic with
 *                                      a gap-fill prompt seeded by `data`
 *                                      and limited to `missing` keys
 *   - `ok:false`                     → caller falls back to full AI parse
 */
export function tryRegexParse(emailBody: string, source: AggregatorSource): ParseResult {
  if (!emailBody || typeof emailBody !== 'string') {
    return { ok: false, reason: 'empty_body' };
  }
  if (!PATTERNS[source]) {
    return { ok: false, reason: `unknown_source:${source}` };
  }

  const body = normalize(emailBody);
  const p = PATTERNS[source];

  const items = extractItems(body, p);
  if (items.length === 0) {
    // No items = the email is either non-templated, an aggregator
    // notification (refund / dispute / status update) without a fresh
    // order, or the layout has shifted. AI gets full control.
    return { ok: false, reason: 'no_items_extracted' };
  }

  const data: ParsedOrder = {
    external_order_id: firstMatch(body, p.orderId),
    items,
    subtotal_ron: firstAmount(body, p.subtotal),
    delivery_fee_ron: firstAmount(body, p.deliveryFee),
    total_ron: firstAmount(body, p.total),
    customer_name: firstMatch(body, p.customerName),
    customer_phone: firstMatch(body, p.customerPhone)?.replace(/[\s\-]/g, '') ?? null,
    delivery_address: firstMatch(body, p.address),
    scheduled_for: firstMatch(body, p.scheduledFor),
    notes: null,
  };

  // If subtotal is missing but item prices are all there, we can derive
  // it. Helpful for layouts that omit the subtotal label entirely.
  if (data.subtotal_ron == null && items.every((it) => it.unit_price_ron != null)) {
    const derived = items.reduce(
      (acc, it) => acc + (it.unit_price_ron ?? 0) * it.quantity,
      0,
    );
    if (derived > 0) data.subtotal_ron = Math.round(derived * 100) / 100;
  }

  const { confidence, missing } = classify(data);
  return { ok: true, data, confidence, missing };
}

/**
 * Cost estimate (RON) per parse strategy. Used by the operator-facing
 * "Costuri AI luna asta" tile and to populate `function_runs.metadata`.
 *
 * Conservative numbers — measured against claude-sonnet-4-5 at the
 * input/output token sizes the parser actually sends. Keep these in
 * sync with `aggregator-email-parser.callAnthropicParser`.
 *
 * RON conversion ≈ 4.6 RON / USD (May 2026, rounded).
 */
export type ParseStrategy = 'regex' | 'regex+ai-fill' | 'ai-full' | 'failed';

const RON_PER_USD = 4.6;

const COST_USD: Record<ParseStrategy, number> = {
  regex: 0,
  'regex+ai-fill': 0.001, // ~1.5k input + ~150 output tokens
  'ai-full': 0.0035, // ~5k input + ~400 output tokens
  failed: 0,
};

export function estimateCostRon(strategy: ParseStrategy): number {
  return Math.round(COST_USD[strategy] * RON_PER_USD * 10000) / 10000;
}

/**
 * Estimate the RON saved by `strategy` versus the all-AI baseline.
 * Used to populate `aggregator_email_jobs.parsed_data.cost_savings_ron`
 * (or whichever sink the integrator chooses).
 *
 * `failed` returns 0 — a failed run did NOT save anything; the parser
 * may already have paid for a full AI attempt before failing. Counting
 * the baseline as saved would inflate the admin savings tile every
 * time Anthropic 5xx'd. Codex review #311.
 */
export function estimateSavingsRon(strategy: ParseStrategy): number {
  if (strategy === 'failed') return 0;
  const baseline = COST_USD['ai-full'] * RON_PER_USD;
  const actual = COST_USD[strategy] * RON_PER_USD;
  return Math.round((baseline - actual) * 10000) / 10000;
}
