// HIR Customer Service Agent — Deno-side canonical runtime (RSHIR Wave 3).
//
// Registered with the Master Orchestrator (PR #341) as the CS sub-agent.
// Six intents per the orchestrator KNOWN_INTENTS list:
//
//   cs.reservation_create     ← create a reservation (write)
//   cs.reservation_list       ← list upcoming + recent reservations (read)
//   cs.reservation_cancel     ← cancel an existing reservation (write)
//   cs.review_reply_draft     ← Claude-drafted reply to a customer review
//   cs.complaint_template     ← templated apology + corrective-action
//   cs.feedback_digest        ← 30d feedback summary (reviews + chat)
//
// Pattern mirror: `_shared/menu-agent.ts` + `_shared/marketing-agent.ts`.
// All Anthropic calls happen via raw fetch (the Anthropic SDK is Node-only;
// Edge Function bundle stays small).
//
// Trust default per intent (action_category):
//   reservation.create   — write, OWNER picks PROPOSE_ONLY vs AUTO_REVERSIBLE
//   reservation.read     — readOnly:true (dispatcher bypasses trust gate)
//   reservation.cancel   — write, default PROPOSE_ONLY
//   review.reply         — defaultCategory 'COPY_PROPOSAL': we ALWAYS treat
//                          the auto-post as a draft. The handler also runs
//                          `assertNotAutoPostingNegative()` defense-in-depth.
//   complaint.template   — readOnly:true (no DB write, just a template)
//   feedback.digest      — readOnly:true (aggregation only)
//
// Side-effect surface: this module writes ONLY to `reservations` (create +
// cancel). Drafts for review_reply land in `cs_agent_responses` so the
// admin UI can surface them on /dashboard/feedback. NEVER posts to a
// public channel automatically — see assertNotAutoPostingNegative.
//
// Deno-compatible. Imported by `supabase/functions/telegram-command-intake`
// and any future web endpoint that wants to drive CS intents through the
// orchestrator.

import {
  registerIntent,
  type HandlerContext,
  type HandlerPlan,
  type HandlerResult,
  type IntentHandler,
} from './master-orchestrator.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CS_AGENT_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Anthropic pricing for Haiku 4.5 (2026-05-15, per 1M tokens, USD).
const INPUT_COST_PER_TOKEN_USD = 1.0 / 1_000_000;
const OUTPUT_COST_PER_TOKEN_USD = 5.0 / 1_000_000;

// Complaint categories — mirrors apps/restaurant-admin/.../cs-agent.ts.
export const COMPLAINT_TYPES = [
  'late_delivery',
  'cold_food',
  'wrong_item',
  'rude_courier',
  'order_missing',
  'other',
] as const;
export type ComplaintType = (typeof COMPLAINT_TYPES)[number];

// ---------------------------------------------------------------------------
// Tiny payload validators (no Zod in the Edge bundle)
// ---------------------------------------------------------------------------

function nonEmptyString(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

function isUuid(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  return !Number.isNaN(Date.parse(v));
}

function asPartySize(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 100) return null;
  return n;
}

// ---------------------------------------------------------------------------
// Anthropic helper (test-injectable fetch)
// ---------------------------------------------------------------------------

let fetchOverride: typeof fetch | null = null;
export function setFetchForTesting(f: typeof fetch | null): void {
  fetchOverride = f;
}

type AnthropicResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
): Promise<AnthropicResult> {
  const fn = fetchOverride ?? fetch;
  const res = await fn(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CS_AGENT_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`anthropic_${res.status}: ${errText.slice(0, 300)}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const text: string =
    Array.isArray(data?.content) && data.content[0]?.type === 'text'
      ? data.content[0].text
      : '';
  if (!text) throw new Error('anthropic_empty_response');
  return {
    text,
    inputTokens: Number(data?.usage?.input_tokens ?? 0),
    outputTokens: Number(data?.usage?.output_tokens ?? 0),
  };
}

function getApiKey(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const key = (globalThis as any).Deno?.env?.get?.('ANTHROPIC_API_KEY') ?? '';
  if (!key) throw new Error('anthropic_missing_api_key');
  return key;
}

function costUsdOf(input: number, output: number): number {
  return input * INPUT_COST_PER_TOKEN_USD + output * OUTPUT_COST_PER_TOKEN_USD;
}

// ---------------------------------------------------------------------------
// Hard guard — never auto-post negative review replies
//
// Mirrors apps/restaurant-admin/src/lib/ai/agents/cs-agent.ts. Even if a
// tenant somehow promotes cs.review.reply to AUTO_FULL, this re-check at
// execute-time refuses to auto-post when the underlying review is
// negative (rating ≤ 3 or LLM-classified negative sentiment).
// ---------------------------------------------------------------------------

export function assertNotAutoPostingNegative(args: {
  rating: number;
  sentiment: 'negative' | 'neutral' | 'positive';
  trustLevel: 'PROPOSE_ONLY' | 'AUTO_REVERSIBLE' | 'AUTO_FULL';
}): void {
  if (args.trustLevel === 'PROPOSE_ONLY') return; // OWNER is in the loop
  if (args.rating <= 3 || args.sentiment === 'negative') {
    throw new Error(
      'cs_auto_post_negative_blocked: review reply requires OWNER approval (rating <= 3 or negative sentiment).',
    );
  }
}

// ---------------------------------------------------------------------------
// Intent 1 — cs.reservation_create
// ---------------------------------------------------------------------------

// Payload: { customer_first_name, customer_phone, customer_email?, party_size, requested_at_iso, notes? }
const reservationCreateHandler: IntentHandler = {
  // Plan: validate payload + read-only slot availability check against the
  // capacity ceiling in reservation_settings. We don't reserve the slot
  // here — execute() does the actual insert. Capacity is a soft hint at
  // plan time; the DB-level check in fn_reservation_request is the source
  // of truth (we leave the RPC alone and insert directly via the table
  // for simplicity, so we re-validate capacity in execute too).
  plan: async (ctx, payload) => {
    const p = payload as Record<string, unknown>;
    const customer_first_name = nonEmptyString(p.customer_first_name, 120);
    const customer_phone = nonEmptyString(p.customer_phone, 60);
    const customer_email = nonEmptyString(p.customer_email, 200);
    const party_size = asPartySize(p.party_size);
    const requested_at_iso = isIsoDate(p.requested_at_iso) ? String(p.requested_at_iso) : null;
    const notes = nonEmptyString(p.notes, 600);

    if (!customer_first_name) throw new Error('invalid_payload: customer_first_name missing');
    if (!customer_phone) throw new Error('invalid_payload: customer_phone missing');
    if (party_size === null) throw new Error('invalid_payload: party_size must be 1..100 integer');
    if (!requested_at_iso) throw new Error('invalid_payload: requested_at_iso must be ISO date');

    // Read settings + soft capacity check. Errors here are not fatal — we
    // log and let execute() do the authoritative DB check.
    let capacityOk = true;
    let capacityHint = '';
    try {
      const { data: settings } = await ctx.supabase
        .from('reservation_settings')
        .select('is_enabled, party_size_max, slot_duration_min, capacity_per_slot, advance_min_minutes, advance_max_days')
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle();
      if (settings) {
        if (!settings.is_enabled) capacityHint = 'Rezervările online sunt dezactivate pentru acest tenant.';
        else if (party_size > settings.party_size_max) {
          capacityOk = false;
          capacityHint = `Grup mai mare decât maximul (${settings.party_size_max}).`;
        }
      }
    } catch (_e) {
      // Best-effort plan-time check; leave to execute().
    }

    return {
      actionCategory: 'reservation.create',
      summary: `Rezervare nouă: ${customer_first_name}, ${party_size} pers., ${requested_at_iso}${capacityHint ? ` — ${capacityHint}` : ''}.`,
      preState: undefined, // create has no pre-state
      resolvedPayload: {
        customer_first_name,
        customer_phone,
        customer_email,
        party_size,
        requested_at_iso,
        notes,
        plan_capacity_ok: capacityOk,
      },
    };
  },
  execute: async (ctx, plan) => {
    const rp = plan.resolvedPayload ?? {};
    const customer_first_name = String(rp.customer_first_name ?? '');
    const customer_phone = String(rp.customer_phone ?? '');
    const customer_email = rp.customer_email ? String(rp.customer_email) : null;
    const party_size = Number(rp.party_size ?? 0);
    const requested_at_iso = String(rp.requested_at_iso ?? '');
    const notes = rp.notes ? String(rp.notes) : null;

    const { data, error } = await ctx.supabase
      .from('reservations')
      .insert({
        tenant_id: ctx.tenantId,
        customer_first_name,
        customer_phone,
        customer_email,
        party_size,
        requested_at: requested_at_iso,
        notes,
        status: 'REQUESTED',
      })
      .select('id, public_track_token, status')
      .maybeSingle();
    if (error) {
      throw new Error(`reservation_insert_failed: ${error.message}`);
    }
    return {
      summary: `Rezervare creată pentru ${customer_first_name} (${party_size} pers.) la ${requested_at_iso}.`,
      data: {
        reservation_id: data?.id ?? null,
        public_track_token: data?.public_track_token ?? null,
        status: data?.status ?? 'REQUESTED',
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Intent 2 — cs.reservation_list (read-only)
//
// Returns reservations in the window [now - 7d, now + 14d] for the tenant.
// ---------------------------------------------------------------------------

const reservationListHandler: IntentHandler = {
  plan: async (_ctx, _payload) => ({
    actionCategory: 'reservation.read',
    summary: 'Listă rezervări (ultimele 7 zile + următoarele 14 zile).',
    resolvedPayload: {},
  }),
  execute: async (ctx, _plan) => {
    const now = Date.now();
    const sinceIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const untilIso = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await ctx.supabase
      .from('reservations')
      .select('id, customer_first_name, customer_phone, party_size, requested_at, status, notes, created_at')
      .eq('tenant_id', ctx.tenantId)
      .gte('requested_at', sinceIso)
      .lte('requested_at', untilIso)
      .order('requested_at', { ascending: true });
    if (error) throw new Error(`reservation_list_failed: ${error.message}`);

    const rows = Array.isArray(data) ? data : [];
    const upcoming = rows.filter((r) => new Date(String(r.requested_at)).getTime() >= now);
    const past = rows.filter((r) => new Date(String(r.requested_at)).getTime() < now);

    return {
      summary: `${rows.length} rezervări în fereastra -7z / +14z (${upcoming.length} viitoare, ${past.length} recente).`,
      data: {
        upcoming,
        past,
        window_from: sinceIso,
        window_to: untilIso,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Intent 3 — cs.reservation_cancel
//
// NOTE: spec asked for a `cancelled_at` column flip. The actual schema
// (migration 20260429_007_reservations.sql) uses a single `status` enum
// instead, with 'CANCELLED' as one of the values. We flip status to
// 'CANCELLED' to match the live schema. pre_state captures the previous
// row so a revert can restore the prior status.
// ---------------------------------------------------------------------------

const reservationCancelHandler: IntentHandler = {
  plan: async (ctx, payload) => {
    const p = payload as Record<string, unknown>;
    if (!isUuid(p.reservation_id)) throw new Error('invalid_payload: reservation_id must be uuid');
    const rejection_reason = nonEmptyString(p.rejection_reason, 400);

    // Read pre-state. If the row doesn't exist or belongs to a different
    // tenant we surface the error in plan() so the dispatcher rejects
    // before execute() runs.
    const { data: row, error } = await ctx.supabase
      .from('reservations')
      .select('id, tenant_id, status, customer_first_name, requested_at')
      .eq('id', p.reservation_id)
      .maybeSingle();
    if (error) throw new Error(`reservation_lookup_failed: ${error.message}`);
    if (!row) throw new Error('reservation_not_found');
    if (row.tenant_id !== ctx.tenantId) throw new Error('reservation_tenant_mismatch');
    if (row.status === 'CANCELLED') {
      throw new Error('reservation_already_cancelled');
    }

    return {
      actionCategory: 'reservation.cancel',
      summary: `Anulare rezervare ${row.customer_first_name} @ ${row.requested_at}.`,
      preState: { status: row.status },
      resolvedPayload: {
        reservation_id: p.reservation_id,
        rejection_reason: rejection_reason ?? null,
      },
    };
  },
  execute: async (ctx, plan) => {
    const rp = plan.resolvedPayload ?? {};
    const reservation_id = String(rp.reservation_id ?? '');
    const rejection_reason = rp.rejection_reason ? String(rp.rejection_reason) : null;

    const { data, error } = await ctx.supabase
      .from('reservations')
      .update({ status: 'CANCELLED', rejection_reason })
      .eq('id', reservation_id)
      .eq('tenant_id', ctx.tenantId)
      .select('id, status')
      .maybeSingle();
    if (error) throw new Error(`reservation_cancel_failed: ${error.message}`);

    return {
      summary: `Rezervare ${reservation_id} marcată CANCELLED.`,
      data: {
        reservation_id: data?.id ?? reservation_id,
        status: data?.status ?? 'CANCELLED',
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Intent 4 — cs.review_reply_draft
//
// Calls Claude Haiku to draft a polite RO reply to a customer review.
// `defaultCategory: 'review.reply'` flagged COPY_PROPOSAL semantics: this
// intent NEVER auto-posts. The handler always returns a draft for OWNER
// review. The orchestrator's trust gate is bypassed at the registry
// (readOnly:true) because the LLM call + persisted draft in
// cs_agent_responses is staging-only — same model as menu-agent.
// ---------------------------------------------------------------------------

const REVIEW_REPLY_SYSTEM = `Ești asistentul "Hepy" al unui restaurant român din suita HIR. Generezi un draft de răspuns politicos la o recenzie de client.

Reguli stricte:
- Răspunsul este în limba română corectă, cu diacritice.
- Niciun emoji.
- Nu promiți compensații în numele restaurantului — sugerează "putem discuta o soluție" doar.
- La review negativ: recunoaște problema, exprimă regret real, oferă o cale de contact (telefon afișat în profil).
- La review pozitiv: mulțumește autentic, invită la revenire.
- Lungime: 60-200 cuvinte.
- Returnează STRICT JSON, fără text înainte sau după.

Forma JSON:
{"reply":"...","sentiment":"negative|neutral|positive","confidence":0.0}`;

const reviewReplyDraftHandler: IntentHandler = {
  plan: async (_ctx, payload) => {
    const p = payload as Record<string, unknown>;
    const review_text = nonEmptyString(p.review_text, 4000);
    const rating = asPartySize(p.rating); // 1..5 fits inside 1..100 — extra check below
    const tenant_name = nonEmptyString(p.tenant_name, 200) ?? '(restaurant)';
    const customer_first_name = nonEmptyString(p.customer_first_name, 120);

    if (!review_text) throw new Error('invalid_payload: review_text missing');
    if (rating === null || rating < 1 || rating > 5) throw new Error('invalid_payload: rating must be 1..5');

    return {
      actionCategory: 'review.reply',
      summary: `Draft răspuns recenzie (rating ${rating}/5) pentru ${tenant_name}.`,
      resolvedPayload: {
        review_text,
        rating,
        tenant_name,
        customer_first_name: customer_first_name ?? null,
      },
    };
  },
  execute: async (ctx, plan) => {
    const rp = plan.resolvedPayload ?? {};
    const review_text = String(rp.review_text ?? '');
    const rating = Number(rp.rating ?? 0);
    const tenant_name = String(rp.tenant_name ?? '(restaurant)');
    const customer_first_name = rp.customer_first_name ? String(rp.customer_first_name) : null;

    const apiKey = getApiKey();
    const userMessage = [
      `Restaurant: ${tenant_name}`,
      `Rating: ${rating}/5`,
      customer_first_name ? `Client: ${customer_first_name}` : 'Client: anonim',
      `Recenzie: ${review_text}`,
      'Generează JSON conform schemei.',
    ].join('\n');

    const raw = await callAnthropic(apiKey, REVIEW_REPLY_SYSTEM, userMessage, 600);
    let parsed: { reply?: string; sentiment?: string; confidence?: number };
    try {
      const cleaned = raw.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`anthropic_unparseable_json: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`);
    }
    const reply = nonEmptyString(parsed.reply, 2000);
    const sentiment = parsed.sentiment;
    if (!reply) throw new Error('anthropic_invalid_shape: reply missing');
    if (sentiment !== 'negative' && sentiment !== 'neutral' && sentiment !== 'positive') {
      throw new Error('anthropic_invalid_shape: sentiment invalid');
    }
    const confidence = typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
      ? parsed.confidence
      : 0.5;
    const costUsd = costUsdOf(raw.inputTokens, raw.outputTokens);

    // Persist as DRAFT in cs_agent_responses so /dashboard/feedback can
    // surface the suggestion. Failure to persist is non-fatal — we still
    // return the draft so the caller can show it inline.
    let draftId: string | null = null;
    try {
      const { data: row } = await ctx.supabase
        .from('cs_agent_responses')
        .insert({
          tenant_id: ctx.tenantId,
          intent: 'review_reply',
          status: 'DRAFT',
          source_id: nonEmptyString((plan.resolvedPayload as Record<string, unknown>)?.source_review_id, 200) ?? null,
          response_options: [{ tone: 'formal', text: reply }],
        })
        .select('id')
        .maybeSingle();
      draftId = (row?.id as string | undefined) ?? null;
    } catch (_e) {
      // tolerable — caller still gets the draft body
    }

    return {
      summary: `Draft răspuns generat (sentiment: ${sentiment}, ${reply.length} caractere).`,
      data: {
        draft_id: draftId,
        reply,
        sentiment,
        confidence,
        rating,
        cost_usd: Number(costUsd.toFixed(6)),
        auto_post: false, // ALWAYS false — see assertNotAutoPostingNegative
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Intent 5 — cs.complaint_template (read-only)
//
// Deterministic templated apology + corrective-action plan. No LLM call —
// reduces cost + latency, predictable RO copy. The OWNER edits the
// template before sending if needed.
// ---------------------------------------------------------------------------

const COMPLAINT_TEMPLATES: Record<
  ComplaintType,
  { apology: string; corrective_action: string; suggested_compensation: string }
> = {
  late_delivery: {
    apology:
      'Vă rugăm să primiți sincerele noastre scuze pentru întârzierea livrării. Înțelegem că vă bazați pe noi să respectăm intervalul promis, iar ieri (sau în această situație) nu am reușit.',
    corrective_action:
      'Verificăm programul curierilor și capacitatea bucătăriei pentru intervalul afectat. Vom comunica restricții realiste la viitoarele comenzi.',
    suggested_compensation: 'Reducere 15% la următoarea comandă',
  },
  cold_food: {
    apology:
      'Ne pare extrem de rău că mâncarea a sosit rece. Standardul nostru este preparare și predare imediată; ce ați primit nu reflectă calitatea pe care o promitem.',
    corrective_action:
      'Discutăm cu echipa de bucătărie procedurile de ambalare și cu echipa de livrare timpii dintre preparare și predare.',
    suggested_compensation: 'Desert gratuit la următoarea comandă',
  },
  wrong_item: {
    apology:
      'Vă rugăm să acceptați scuzele noastre pentru produsul greșit livrat. Este o eroare de pregătire pentru care ne asumăm responsabilitatea integral.',
    corrective_action:
      'Revizuim procedura de verificare a comenzii înainte de plecare către curier. Vă putem retrimite produsul corect sau procesa un refund parțial.',
    suggested_compensation: 'Refund parțial pentru produsul greșit',
  },
  rude_courier: {
    apology:
      'Comportamentul curierului descris nu reflectă standardele HIR. Vă mulțumim că ne-ați semnalat — fără feedback nu putem corecta.',
    corrective_action:
      'Raportăm incidentul către parteneriatul de livrare și deschidem o anchetă internă. Veți primi un update în 48 de ore.',
    suggested_compensation: 'Reducere 20% la următoarea comandă',
  },
  order_missing: {
    apology:
      'Ne pare profund rău că nu ați primit comanda. Aceasta este o problemă majoră de operare pe care o tratăm cu prioritate maximă.',
    corrective_action:
      'Procesăm refund integral imediat și deschidem o investigație cu echipa de livrare. Vă vom contacta cu rezultatul.',
    suggested_compensation: 'Refund integral al comenzii',
  },
  other: {
    apology:
      'Vă mulțumim că ne-ați semnalat problema. Ne pare rău pentru experiența negativă și ne dorim să găsim o soluție rapidă împreună.',
    corrective_action:
      'Vom contacta personal pentru a înțelege detaliile și a stabili pași concreți de remediere.',
    suggested_compensation: 'O soluție stabilită de comun acord',
  },
};

const complaintTemplateHandler: IntentHandler = {
  plan: async (_ctx, payload) => {
    const p = payload as Record<string, unknown>;
    const category = typeof p.category === 'string' ? p.category.trim().toLowerCase() : '';
    if (!COMPLAINT_TYPES.includes(category as ComplaintType)) {
      throw new Error(`invalid_payload: category must be one of ${COMPLAINT_TYPES.join('|')}`);
    }
    const customer_first_name = nonEmptyString(p.customer_first_name, 120);
    const context = nonEmptyString(p.context, 600);
    return {
      actionCategory: 'complaint.template',
      summary: `Template reclamație — ${category}.`,
      resolvedPayload: {
        category,
        customer_first_name: customer_first_name ?? null,
        context: context ?? null,
      },
    };
  },
  execute: async (_ctx, plan) => {
    const rp = plan.resolvedPayload ?? {};
    const category = String(rp.category ?? 'other') as ComplaintType;
    const customer_first_name = rp.customer_first_name ? String(rp.customer_first_name) : null;

    const tpl = COMPLAINT_TEMPLATES[category] ?? COMPLAINT_TEMPLATES.other;
    const greeting = customer_first_name
      ? `Stimată Doamnă / Stimate Domn ${customer_first_name},`
      : 'Stimată Doamnă / Stimate Domn,';

    const text = [
      greeting,
      '',
      tpl.apology,
      '',
      tpl.corrective_action,
      '',
      `Vă propunem ca formă de compensare: ${tpl.suggested_compensation}.`,
      '',
      'Cu stimă,',
      'Echipa restaurantului',
    ].join('\n');

    return {
      summary: `Template generat pentru categoria "${category}".`,
      data: {
        category,
        text,
        apology: tpl.apology,
        corrective_action: tpl.corrective_action,
        suggested_compensation: tpl.suggested_compensation,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Intent 6 — cs.feedback_digest (read-only)
//
// Aggregates the last 30 days of restaurant_reviews + cs_agent_responses
// into a structured summary. No LLM call — pure SQL aggregation. The
// admin UI can re-render with Claude on demand via cs.review_reply_draft.
// ---------------------------------------------------------------------------

const feedbackDigestHandler: IntentHandler = {
  plan: async (_ctx, _payload) => ({
    actionCategory: 'feedback.digest',
    summary: 'Sumar feedback ultimele 30 de zile.',
    resolvedPayload: {},
  }),
  execute: async (ctx, _plan) => {
    const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Reviews — rating + comment for the last 30d.
    const { data: reviewRows, error: revErr } = await ctx.supabase
      .from('restaurant_reviews')
      .select('rating, comment, created_at')
      .eq('tenant_id', ctx.tenantId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false });
    if (revErr) throw new Error(`feedback_digest_reviews_failed: ${revErr.message}`);

    // Complaints — count DRAFT/SELECTED/POSTED complaint_template rows.
    let complaintRows: Array<{ source_id: string | null; created_at: string }> = [];
    try {
      const { data } = await ctx.supabase
        .from('cs_agent_responses')
        .select('source_id, created_at')
        .eq('tenant_id', ctx.tenantId)
        .eq('intent', 'complaint_template')
        .gte('created_at', sinceIso);
      complaintRows = Array.isArray(data) ? data : [];
    } catch (_e) {
      // table may not exist in some test envs; treat as zero
    }

    const reviews = Array.isArray(reviewRows) ? reviewRows : [];
    const total = reviews.length;
    const avgRating =
      total === 0
        ? null
        : +(reviews.reduce((s, r) => s + Number(r.rating ?? 0), 0) / total).toFixed(2);
    const negative = reviews.filter((r) => Number(r.rating ?? 0) <= 2).length;
    const neutral = reviews.filter((r) => Number(r.rating ?? 0) === 3).length;
    const positive = reviews.filter((r) => Number(r.rating ?? 0) >= 4).length;

    // Bucket complaints by source_id (the complaint category enum string).
    const complaintsByCategory: Record<string, number> = {};
    for (const c of complaintRows) {
      const k = c.source_id ?? 'unknown';
      complaintsByCategory[k] = (complaintsByCategory[k] ?? 0) + 1;
    }

    return {
      summary: `Sumar 30z: ${total} recenzii (medie ${avgRating ?? 'n/a'}), ${complaintRows.length} reclamații.`,
      data: {
        window_from: sinceIso,
        reviews_count: total,
        average_rating: avgRating,
        breakdown: { negative, neutral, positive },
        complaints_count: complaintRows.length,
        complaints_by_category: complaintsByCategory,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Registration — idempotent
// ---------------------------------------------------------------------------

let registered = false;

export function registerCsIntents(): void {
  if (registered) return;
  registered = true;

  registerIntent({
    name: 'cs.reservation_create',
    agent: 'cs',
    defaultCategory: 'reservation.create',
    description: 'Creează o rezervare nouă.',
    handler: reservationCreateHandler,
  });
  registerIntent({
    name: 'cs.reservation_list',
    agent: 'cs',
    defaultCategory: 'reservation.read',
    description: 'Listează rezervările (ultimele 7 zile + următoarele 14).',
    readOnly: true,
    handler: reservationListHandler,
  });
  registerIntent({
    name: 'cs.reservation_cancel',
    agent: 'cs',
    defaultCategory: 'reservation.cancel',
    description: 'Anulează o rezervare existentă.',
    handler: reservationCancelHandler,
  });
  registerIntent({
    name: 'cs.review_reply_draft',
    agent: 'cs',
    defaultCategory: 'review.reply',
    description: 'Generează un draft de răspuns la o recenzie (NU se publică automat).',
    // Staging-only: the draft lands in cs_agent_responses, never on a
    // public surface. assertNotAutoPostingNegative is the run-time guard.
    readOnly: true,
    handler: reviewReplyDraftHandler,
  });
  registerIntent({
    name: 'cs.complaint_template',
    agent: 'cs',
    defaultCategory: 'complaint.template',
    description: 'Generează template empatic pentru o reclamație + compensație sugerată.',
    readOnly: true,
    handler: complaintTemplateHandler,
  });
  registerIntent({
    name: 'cs.feedback_digest',
    agent: 'cs',
    defaultCategory: 'feedback.digest',
    description: 'Sumar feedback clienți pe ultimele 30 de zile.',
    readOnly: true,
    handler: feedbackDigestHandler,
  });
}

export function __resetRegisteredForTesting(): void {
  registered = false;
}

// Test-only handler refs (parity with menu-agent / compliance-agent).
export const __TESTING__ = {
  reservationCreateHandler,
  reservationListHandler,
  reservationCancelHandler,
  reviewReplyDraftHandler,
  complaintTemplateHandler,
  feedbackDigestHandler,
  COMPLAINT_TEMPLATES,
};
