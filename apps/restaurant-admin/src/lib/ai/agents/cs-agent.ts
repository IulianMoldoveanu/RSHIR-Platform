// HIR Customer Service Agent (Sprint 14).
//
// Three intents drafted to the OWNER:
//   1. cs.review_reply         → 3 ranked reply options for a customer review
//   2. cs.complaint_template   → empathetic complaint response + comp suggestion
//   3. cs.feedback_digest      → weekly summary across reviews + chat + ratings
//
// Trust default = PROPOSE_ONLY ("suggest"). Owner picks an option, edits if
// needed, then posts. We NEVER auto-post negative-review replies regardless
// of the trust level — see `assertNotAutoPostingNegative()` below. That
// behaviour is enforced server-side, not via UI hide.
//
// Voice:
//   - OWNER guidance copy (button labels, status pills, the digest's action
//     items): Brand Voice A — concise, merchant-facing, formal RO
//     ("dumneavoastră").
//   - Customer-facing draft text the OWNER will eventually paste back to
//     the customer: Brand Voice C — warm, empathetic, RO. Each option
//     declares its tone (formal/warm/direct) so the UI can label them.
//
// Side-effect surface: this module is PURE w.r.t. Supabase. It only calls
// Anthropic and returns parsed JSON. The server action wires the result
// into Supabase + audit + the orchestrator ledger.

import Anthropic, { APIError } from '@anthropic-ai/sdk';
import { z } from 'zod';

// Same canonical Sonnet model used elsewhere (anthropic.ts, growth-agent,
// supervise-fix). Drift here without updating the comment is a smell.
const CS_AGENT_MODEL = 'claude-sonnet-4-5-20250929';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ResponseTone = 'formal' | 'warm' | 'direct';

export type ComplaintType =
  | 'late_delivery'
  | 'cold_food'
  | 'wrong_item'
  | 'rude_courier'
  | 'order_missing'
  | 'other';

export type CsAgentFailureKind =
  | 'auth_or_billing'
  | 'rate_limited'
  | 'model_not_found'
  | 'invalid_input'
  | 'unknown';

export class CsAgentError extends Error {
  readonly kind: CsAgentFailureKind;
  readonly status: number | undefined;
  constructor(kind: CsAgentFailureKind, message: string, opts?: { status?: number }) {
    super(message);
    this.name = 'CsAgentError';
    this.kind = kind;
    this.status = opts?.status;
  }
}

// ---------------------------------------------------------------------------
// Anthropic client (lazy init — same pattern as anthropic.ts)
// ---------------------------------------------------------------------------

let cached: Anthropic | null = null;

function getClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new CsAgentError(
      'auth_or_billing',
      'ANTHROPIC_API_KEY not set. CS Agent requires a Claude API key.',
    );
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

function classify(err: unknown): CsAgentError {
  if (err instanceof CsAgentError) return err;
  if (err instanceof APIError) {
    const status = err.status as number | undefined;
    if (status === 401 || /credit balance/i.test(err.message)) {
      return new CsAgentError('auth_or_billing', err.message, { status });
    }
    if (status === 429) return new CsAgentError('rate_limited', err.message, { status });
    if (status === 404) return new CsAgentError('model_not_found', err.message, { status });
    if (status === 400 || status === 422) {
      return new CsAgentError('invalid_input', err.message, { status });
    }
    return new CsAgentError('unknown', err.message, { status });
  }
  return new CsAgentError('unknown', err instanceof Error ? err.message : String(err));
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fence ? fence[1] : trimmed).trim();
}

// ---------------------------------------------------------------------------
// Schemas (zod) — used to validate Claude's JSON output before persisting.
// ---------------------------------------------------------------------------

const replyOptionSchema = z.object({
  tone: z.enum(['formal', 'warm', 'direct']),
  text: z.string().trim().min(20).max(800),
});

export const reviewReplyOptionsSchema = z.object({
  options: z.array(replyOptionSchema).length(3),
  // Hepy's read of the review's overall sentiment. Used by the server
  // action to decide whether to escalate to OWNER alert.
  sentiment: z.enum(['negative', 'neutral', 'positive']),
  // 0..1 confidence the agent has in its sentiment label. Below 0.6 we
  // treat the reply as low-confidence and show a banner.
  confidence: z.number().min(0).max(1),
});

export type ReviewReplyOptions = z.infer<typeof reviewReplyOptionsSchema>;

const complaintOptionSchema = z.object({
  tone: z.enum(['formal', 'warm', 'direct']),
  text: z.string().trim().min(20).max(800),
  suggested_compensation: z.string().trim().max(160),
});

export const complaintTemplateSchema = z.object({
  options: z.array(complaintOptionSchema).length(3),
});

export type ComplaintTemplateResult = z.infer<typeof complaintTemplateSchema>;

export const feedbackDigestSchema = z.object({
  top_praised: z.array(z.string().trim().min(2).max(200)).min(0).max(3),
  top_complaints: z.array(z.string().trim().min(2).max(200)).min(0).max(3),
  sentiment: z.object({
    trend: z.enum(['improving', 'stable', 'declining', 'unknown']),
    score: z.number().min(-1).max(1),
  }),
  action_items: z.array(z.string().trim().min(2).max(200)).min(0).max(5),
});

export type FeedbackDigest = z.infer<typeof feedbackDigestSchema>;

// ---------------------------------------------------------------------------
// Voice C system prompt (customer-facing, RO empathetic)
// ---------------------------------------------------------------------------

const REVIEW_REPLY_SYSTEM = `Ești asistentul de comunicare cu clienții al unui restaurant român, parte din suita HIR. Generezi 3 variante de răspuns la o recenzie de client.

Ton:
- Formal: "Stimată Doamnă/Stimate Domn", politicos, distant respectuos.
- Cald: prieten apropiat dar profesional, foloseste prenumele dacă este disponibil, exprimă recunoștință autentică.
- Direct: scurt și la obiect, nu sentimental, focusat pe acțiune (refund, retrimitere, scuze concrete).

Reguli stricte:
- TOATE răspunsurile sunt în limba română corectă, cu diacritice.
- Niciun emoji.
- Nu promiți compensații în numele restaurantului — sugerează "putem discuta o soluție" doar.
- La review negativ: recunoaște problema, exprimă regret real, oferă o cale de contact directă (telefon sau email afișat în profilul restaurantului), NU închide cu defensivă.
- La review pozitiv: mulțumește autentic, invită la revenire, fără limbaj robotic ("multumim pentru feedback-ul dumneavoastră").
- Lungime: 60-200 cuvinte per variantă.
- Returnează STRICT JSON, fără text înainte sau după.

Forma JSON:
{"options":[{"tone":"formal","text":"..."},{"tone":"warm","text":"..."},{"tone":"direct","text":"..."}],"sentiment":"negative|neutral|positive","confidence":0.0-1.0}`;

const COMPLAINT_TEMPLATE_SYSTEM = `Ești asistentul de comunicare al unui restaurant român (suita HIR). Generezi 3 variante de răspuns empatic la o reclamație de client + sugestii concrete de compensație.

Tipuri de reclamații cunoscute:
- late_delivery — comanda a sosit târziu
- cold_food — mâncarea era rece la livrare
- wrong_item — produs greșit livrat
- rude_courier — comportament nepotrivit al curierului
- order_missing — comanda nu a sosit deloc
- other — altă problemă

Compensații sugerate (alegeți cea potrivită cu severitatea, în limba română):
- Reducere 10-20% la următoarea comandă (probleme minore)
- Desert gratuit la următoarea comandă (probleme medii)
- Refund parțial al comenzii curente (probleme medii-mari)
- Refund integral (probleme majore — order_missing, intoxicație, comportament grav)

Ton:
- Formal: "Vă rugăm să primiți scuzele noastre sincere..."
- Cald: empatic, "îmi pare extrem de rău că ați avut această experiență..."
- Direct: scurt, focusat pe soluție, "Refund integral procesat în 24h."

Reguli stricte:
- TOATE răspunsurile în română cu diacritice.
- Niciun emoji.
- Asumă responsabilitatea — nu da vina pe curier/aplicație/vreme.
- Recunoaște emoțional impactul ÎNAINTE de a oferi soluție.
- Returnează STRICT JSON.

Forma JSON:
{"options":[{"tone":"formal","text":"...","suggested_compensation":"..."},{"tone":"warm",...},{"tone":"direct",...}]}`;

const FEEDBACK_DIGEST_SYSTEM = `Ești analistul de experiență client al unui restaurant român (suita HIR). Primești recenziile, mesajele de suport și rating-urile din ultima săptămână și produci un sumar acționabil pentru proprietar.

Reguli stricte:
- Toate textele în română cu diacritice.
- top_praised: maxim 3 elemente specifice ce au fost lăudate ("șnițel parizian crocant", "livrare rapidă în Brașov centru"). Dacă nu există laude clare, returnează listă goală.
- top_complaints: maxim 3 teme recurente de plângere ("livrare târzie după ora 21", "porțiile mici la prânz"). Dacă nu există plângeri, returnează listă goală.
- sentiment.trend: comparație vs săptămâna anterioară dacă datele permit, altfel "unknown".
- sentiment.score: medie ponderată pe scala -1 (foarte negativ) la +1 (foarte pozitiv).
- action_items: maxim 5 acțiuni concrete pentru proprietar ("Verificați programul curierilor după ora 21", "Adăugați 2 desserts noi în meniu"). Concise — sub 20 cuvinte fiecare.
- Niciun emoji. Fără diminutive ("supuța"). Fără jargon ("KPI", "DAU").

Forma JSON:
{"top_praised":["..."],"top_complaints":["..."],"sentiment":{"trend":"improving|stable|declining|unknown","score":-1.0..1.0},"action_items":["..."]}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getClient();
  let response;
  try {
    response = await client.messages.create({
      model: CS_AGENT_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
  } catch (err) {
    throw classify(err);
  }
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new CsAgentError('unknown', 'Claude returned no text content.');
  }
  return stripJsonFences(textBlock.text);
}

function parseJsonOrThrow<T>(raw: string, schema: z.ZodSchema<T>, label: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CsAgentError(
      'unknown',
      `${label}: Claude returned non-JSON: ${raw.slice(0, 300)}${raw.length > 300 ? '…' : ''}`,
    );
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new CsAgentError(
      'unknown',
      `${label}: schema validation failed — ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type GenerateReviewReplyInput = {
  tenantName: string;
  rating: number; // 1..5
  comment: string | null;
  customerFirstName?: string | null;
};

/**
 * Generate 3 ranked reply options for a customer review.
 * Pure: no Supabase, no audit; caller decides what to persist.
 */
export async function generateReviewReply(
  input: GenerateReviewReplyInput,
): Promise<ReviewReplyOptions> {
  const userPrompt = [
    `Restaurant: ${input.tenantName}`,
    `Rating: ${input.rating} din 5`,
    input.customerFirstName ? `Client: ${input.customerFirstName}` : 'Client: anonim',
    `Comentariu: ${input.comment ?? '(fără comentariu, doar rating)'}`,
  ].join('\n');
  const raw = await callClaude(REVIEW_REPLY_SYSTEM, userPrompt);
  return parseJsonOrThrow(raw, reviewReplyOptionsSchema, 'review_reply');
}

export type GenerateComplaintTemplateInput = {
  tenantName: string;
  complaintType: ComplaintType;
  context?: string | null; // optional free-form OWNER note about the order
};

/**
 * Generate 3 empathetic complaint-response templates with suggested
 * compensations. Pure.
 */
export async function generateComplaintTemplate(
  input: GenerateComplaintTemplateInput,
): Promise<ComplaintTemplateResult> {
  const userPrompt = [
    `Restaurant: ${input.tenantName}`,
    `Tip reclamație: ${input.complaintType}`,
    input.context ? `Context: ${input.context}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const raw = await callClaude(COMPLAINT_TEMPLATE_SYSTEM, userPrompt);
  return parseJsonOrThrow(raw, complaintTemplateSchema, 'complaint_template');
}

export type FeedbackInput = {
  tenantName: string;
  weekIso: string; // e.g. '2026-W19'
  reviews: Array<{ rating: number; comment: string | null; created_at: string }>;
  chatMessages: Array<{ category: string | null; message: string; created_at: string }>;
  // Average / count snapshot from previous week, if available.
  previousWeek?: {
    avgRating: number | null;
    reviewCount: number;
  } | null;
};

/**
 * Generate weekly customer feedback digest. Pure.
 *
 * Caller is expected to pre-filter to one week of data — the agent does
 * not date-window. Empty inputs are valid (returns "no data" digest).
 */
export async function generateFeedbackDigest(
  input: FeedbackInput,
): Promise<FeedbackDigest> {
  // Cap the input size — even if the OWNER has 500 reviews/week, we can't
  // dump them all into a single prompt. Take the most recent 80 reviews +
  // 80 chat messages; that's plenty for theme detection without blowing
  // up the token bill.
  const reviews = input.reviews.slice(-80);
  const chats = input.chatMessages.slice(-80);

  // Edge case: no data at all → return a deterministic "nothing happened"
  // digest without calling the model. Saves a token round-trip and avoids
  // a hallucinated trend.
  if (reviews.length === 0 && chats.length === 0) {
    return {
      top_praised: [],
      top_complaints: [],
      sentiment: { trend: 'unknown', score: 0 },
      action_items: [
        'Săptămâna aceasta nu au fost recenzii sau mesaje noi. Continuați promovarea linkului de feedback la livrare.',
      ],
    };
  }

  const userPrompt = [
    `Restaurant: ${input.tenantName}`,
    `Săptămână: ${input.weekIso}`,
    input.previousWeek
      ? `Săptămâna anterioară: ${input.previousWeek.reviewCount} recenzii, rating mediu ${input.previousWeek.avgRating ?? 'n/a'}`
      : 'Săptămâna anterioară: (date indisponibile)',
    '',
    `Recenzii (${reviews.length}):`,
    ...reviews.map(
      (r) => `- [${r.rating}★] ${r.comment ? r.comment.replace(/\s+/g, ' ').slice(0, 280) : '(fără comentariu)'}`,
    ),
    '',
    `Mesaje suport (${chats.length}):`,
    ...chats.map(
      (m) => `- [${m.category ?? 'OTHER'}] ${m.message.replace(/\s+/g, ' ').slice(0, 280)}`,
    ),
  ].join('\n');

  const raw = await callClaude(FEEDBACK_DIGEST_SYSTEM, userPrompt);
  return parseJsonOrThrow(raw, feedbackDigestSchema, 'feedback_digest');
}

// ---------------------------------------------------------------------------
// Hard guard — never auto-post negative review replies.
//
// Even if a tenant somehow gets cs.review.reply set to AUTO_REVERSIBLE or
// AUTO_FULL (admin UI caps it via the destructive flag, but defense in
// depth), this guard re-checks at post time. Server actions MUST call
// this before flipping a review reply from SELECTED to POSTED via the
// auto-post code path.
// ---------------------------------------------------------------------------

export function assertNotAutoPostingNegative(args: {
  rating: number;
  sentiment: 'negative' | 'neutral' | 'positive';
  trustLevel: 'PROPOSE_ONLY' | 'AUTO_REVERSIBLE' | 'AUTO_FULL';
}): void {
  if (args.trustLevel === 'PROPOSE_ONLY') return; // OWNER is in the loop
  if (args.rating <= 3 || args.sentiment === 'negative') {
    throw new CsAgentError(
      'invalid_input',
      'Răspunsurile la recenzii negative nu pot fi publicate automat — necesită aprobarea proprietarului.',
    );
  }
}

// ---------------------------------------------------------------------------
// Constants exported for the UI/tests
// ---------------------------------------------------------------------------

export const COMPLAINT_TYPES: Array<{ value: ComplaintType; label: string }> = [
  { value: 'late_delivery', label: 'Livrare târzie' },
  { value: 'cold_food', label: 'Mâncare rece' },
  { value: 'wrong_item', label: 'Produs greșit' },
  { value: 'rude_courier', label: 'Comportament curier' },
  { value: 'order_missing', label: 'Comandă nelivrată' },
  { value: 'other', label: 'Altă problemă' },
];

export const TONE_LABELS: Record<ResponseTone, string> = {
  formal: 'Formal',
  warm: 'Cald',
  direct: 'Direct',
};

export const CS_AGENT_MODEL_ID = CS_AGENT_MODEL;
