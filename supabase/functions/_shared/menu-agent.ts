// Menu Agent — Deno-side canonical runtime (Sprint 12).
//
// Registered with the Master Orchestrator (PR #341) as the first sub-agent
// to use the dispatcher's plan/execute contract end-to-end. Three intents
// per the lane brief MENU-AGENT-SPRINT-12:
//
//   menu.propose_new_item ← Telegram /menu_propune <descriere>
//   menu.mark_sold_out    ← Telegram /menu_oprime <item-name> [until]
//   menu.draft_promo      ← Telegram /menu_promo <item-name> <brief>
//
// All three execute under `readOnly: true` from the dispatcher's
// perspective — they create a DRAFT row in `menu_agent_proposals` (a
// private staging table the OWNER reviews under "Sugestii Hepy" on
// /dashboard/menu) but never mutate `restaurant_menu_items`. The lane
// brief is explicit: "DO NOT auto-publish menu items in this lane —
// keep proposals in DRAFT only".
//
// Why readOnly is correct here:
//   The dispatcher's trust gate exists to guard tenant-customer-facing
//   state. A staging row that the OWNER explicitly reviews + accepts is
//   not customer-facing. The act of generating an AI suggestion is
//   semantically read-only from the tenant's POV ("what would you
//   suggest?"). Sprint 13 will revisit when Menu Agent learns to apply
//   suggestions to the live menu under AUTO_REVERSIBLE trust.
//
// Cost target: $0.05-0.10 per invocation (input ~500 tok, output ~200 tok
// at Sonnet 4.5 = $0.0015 + $0.003 ≈ $0.0045 — well under target). Daily
// cap = 5 per tenant per day enforced before the Anthropic call.

import {
  registerIntent,
  type HandlerContext,
  type HandlerPlan,
  type HandlerResult,
  type IntentHandler,
} from './master-orchestrator.ts';

// ---------------------------------------------------------------------------
// Constants — kept in sync with apps/restaurant-admin/src/lib/ai/agents/menu-agent.ts
// (the Node-side type mirror). Drift caught by menu-agent.test.ts.
// ---------------------------------------------------------------------------

export const MENU_AGENT_MODEL = 'claude-sonnet-4-5-20250929';
export const DAILY_INVOCATION_CAP = 5;
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Anthropic pricing for Sonnet 4.5 (2026-05-08).
const INPUT_COST_PER_TOKEN_USD = 3.0 / 1_000_000;
const OUTPUT_COST_PER_TOKEN_USD = 15.0 / 1_000_000;

// ---------------------------------------------------------------------------
// Payload validators — runtime-light JSON shape checks. We don't bring Zod
// into the Edge Function bundle (would add ~70KB to the cold-start). The
// admin-side mirror uses Zod; both must agree on the shape.
// ---------------------------------------------------------------------------

function nonEmptyString(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

function nonNegNumber(v: unknown, max: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const t = Date.parse(v);
  return !Number.isNaN(t);
}

function tagArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && x.length <= 40)
    .slice(0, 8);
}

// ---------------------------------------------------------------------------
// Prompts — RO formal; same content as the Node-side mirror so a future
// move to a shared package preserves output parity.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_NEW_ITEM = `Ești asistentul "Hepy" pentru un restaurant din România. Pe baza descrierii sumare a operatorului, propui un produs nou pentru meniu.

Reguli:
- Returnezi DOAR JSON valid, fără text suplimentar, fără ghilimele de cod.
- Forma exactă: {"name":"...","description":"...","price_ron":0,"category_hint":"...","tags":[]}.
- Nume: 2-6 cuvinte, în română, fără emoji.
- Description: 1-3 propoziții, ton formal-cald, listează ingredientele principale și servirea (gramaj/porție).
- price_ron: număr (RON), realist pentru segmentul casual românesc; ține seama de costul ingredientelor menționate.
- category_hint: o categorie simplă ("Deserturi", "Aperitive", "Burgeri", "Salate", "Băuturi", etc.).
- tags: 0-5 etichete scurte ("vegetarian", "spicy", "post", "fresh"). Nu inventa tag-uri inexistente.
- Toate textele în română. Nu traduce niciun nume propriu.`;

const SYSTEM_PROMPT_SOLD_OUT = `Ești asistentul "Hepy" al restaurantului. Operatorul îți cere să marchezi un produs ca epuizat temporar.

Reguli:
- Returnezi DOAR JSON valid, fără text suplimentar.
- Forma: {"item_id":"...","item_name":"...","customer_facing_reason":"...","until_iso":"..."}.
- item_id și item_name vin din input — copiezi exact.
- customer_facing_reason: o singură propoziție în română formală, vizibilă clienților ("Epuizat temporar — revine mâine după-amiază."). Maxim 280 caractere. NU folosi termeni interni ("furnizor lipsă", "schimb tură") — formulează din perspectiva clientului.
- until_iso: ISO 8601 cu fus orar; copiezi exact valoarea primită în input.`;

const SYSTEM_PROMPT_PROMO = `Ești asistentul "Hepy" al restaurantului. Operatorul îți cere să generezi o propunere de promoție pentru un produs din meniu.

Reguli:
- Returnezi DOAR JSON valid, fără text suplimentar.
- Forma: {"item_id":"...","item_name":"...","discount_pct":0,"headline":"...","body":"...","valid_from":"...","valid_to":"..."}.
- discount_pct: număr întreg între 1 și 90 (procent).
- headline: maxim 80 caractere, ton de marketing scurt, fără MAJUSCULE complete.
- body: 1-2 propoziții în română formală, exprimă valoarea pentru client.
- valid_from / valid_to: ISO 8601 cu fus orar; intervalul = perioada promoției (default: vineri 18:00 → duminică 22:00 dacă brief-ul nu specifică altceva).
- item_id și item_name: copiezi exact din input.`;

// ---------------------------------------------------------------------------
// Anthropic call (raw fetch, Deno-friendly)
// ---------------------------------------------------------------------------

type AnthropicResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

// Test injection — vitest spec sets a stub fetch via this hook so we don't
// hit the live Anthropic API during unit tests. Production sets to null.
let fetchOverride: typeof fetch | null = null;
export function setFetchForTesting(f: typeof fetch | null): void {
  fetchOverride = f;
}

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
      model: MENU_AGENT_MODEL,
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
    Array.isArray(data?.content) && data.content[0]?.type === 'text' ? data.content[0].text : '';
  if (!text) throw new Error('anthropic_empty_response');
  return {
    text,
    inputTokens: Number(data?.usage?.input_tokens ?? 0),
    outputTokens: Number(data?.usage?.output_tokens ?? 0),
  };
}

function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(trimmed);
}

function costUsdOf(input: number, output: number): number {
  return input * INPUT_COST_PER_TOKEN_USD + output * OUTPUT_COST_PER_TOKEN_USD;
}

// ---------------------------------------------------------------------------
// Daily cap helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkDailyCap(supabase: any, tenantId: string): Promise<{ count: number; capped: boolean }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('menu_agent_invocations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', since);
  if (error) {
    console.warn('[menu-agent] checkDailyCap failed:', error.message);
    return { count: 0, capped: false };
  }
  const n = typeof count === 'number' ? count : 0;
  return { count: n, capped: n >= DAILY_INVOCATION_CAP };
}

async function recordInvocation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: { tenantId: string; intent: string; outcome: 'ok' | 'failed' | 'capped'; costUsd?: number },
): Promise<void> {
  const cost_micro_usd =
    typeof args.costUsd === 'number' ? Math.round(args.costUsd * 1_000_000) : null;
  const { error } = await supabase.from('menu_agent_invocations').insert({
    tenant_id: args.tenantId,
    intent: args.intent,
    outcome: args.outcome,
    cost_micro_usd,
  });
  if (error) console.warn('[menu-agent] recordInvocation failed:', error.message);
}

// Helper exposed to handlers — wraps the Anthropic call + cap check +
// invocation recording. Throws on any failure (the dispatcher's
// handler_threw error path catches and writes the failure to the
// orchestrator ledger). The proposal row is inserted by the caller's
// execute() phase.
async function getApiKey(): Promise<string> {
  // Edge Function secret. Set via `supabase secrets set ANTHROPIC_API_KEY=...`
  // (see scripts/post-merge/setup-supabase-secrets.mjs in the repo).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const key = (globalThis as any).Deno?.env?.get?.('ANTHROPIC_API_KEY') ?? '';
  if (!key) throw new Error('anthropic_missing_api_key');
  return key;
}

// ---------------------------------------------------------------------------
// Per-intent handlers
// ---------------------------------------------------------------------------

// `menu.propose_new_item` — input: { seed: string, category_hint?: string }
const proposeNewItemHandler: IntentHandler = {
  // Plan is pure: validates input shape, emits a one-line summary, and
  // forwards the input verbatim as resolvedPayload (no Anthropic call here
  // — that would be a side effect with cost).
  plan: async (_ctx, payload) => {
    const seed = nonEmptyString((payload as { seed?: unknown }).seed, 600);
    if (!seed) throw new Error('invalid_payload: seed missing or empty');
    const category_hint = nonEmptyString((payload as { category_hint?: unknown }).category_hint, 80) ?? '';
    const plan: HandlerPlan = {
      actionCategory: 'proposal.create',
      summary: `Propunere produs nou: "${seed.slice(0, 80)}".`,
      resolvedPayload: { seed, category_hint },
    };
    return plan;
  },
  // Execute: cap check → Anthropic → Zod → INSERT menu_agent_proposals.
  execute: async (ctx, plan) => {
    const seed = String(plan.resolvedPayload?.seed ?? '');
    const category_hint = String(plan.resolvedPayload?.category_hint ?? '');
    const cap = await checkDailyCap(ctx.supabase, ctx.tenantId);
    if (cap.capped) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.propose_new_item',
        outcome: 'capped',
      });
      throw new Error('daily_cap_reached');
    }

    const apiKey = await getApiKey();
    const userMessage = [
      `Descriere operator: ${seed}`,
      category_hint ? `Categorie sugerată: ${category_hint}` : null,
      'Generează propunerea în JSON conform formatului din system prompt.',
    ]
      .filter(Boolean)
      .join('\n');

    let raw: AnthropicResult;
    try {
      raw = await callAnthropic(apiKey, SYSTEM_PROMPT_NEW_ITEM, userMessage, 600);
    } catch (e) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.propose_new_item',
        outcome: 'failed',
      });
      throw e;
    }

    let parsed: unknown;
    try {
      parsed = extractJson(raw.text);
    } catch (e) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.propose_new_item',
        outcome: 'failed',
        costUsd: costUsdOf(raw.inputTokens, raw.outputTokens),
      });
      throw new Error(`anthropic_unparseable_json: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`);
    }

    const obj = parsed as Record<string, unknown>;
    const name = nonEmptyString(obj.name, 200);
    const description = nonEmptyString(obj.description, 800);
    const price_ron = nonNegNumber(obj.price_ron, 10000);
    const cat = nonEmptyString(obj.category_hint, 120);
    if (!name || !description || price_ron === null || !cat) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.propose_new_item',
        outcome: 'failed',
        costUsd: costUsdOf(raw.inputTokens, raw.outputTokens),
      });
      throw new Error('anthropic_invalid_shape: required fields missing');
    }
    const tags = tagArray(obj.tags);
    const finalPayload = { name, description, price_ron, category_hint: cat, tags };

    const rationale = `Propunere bazată pe: "${seed.slice(0, 120)}". Categorie: ${cat}. Preț: ${price_ron.toFixed(2)} RON.`;
    const costUsd = costUsdOf(raw.inputTokens, raw.outputTokens);

    const { data, error } = await ctx.supabase
      .from('menu_agent_proposals')
      .insert({
        tenant_id: ctx.tenantId,
        kind: 'new_item',
        status: 'DRAFT',
        payload: finalPayload,
        rationale,
        model: MENU_AGENT_MODEL,
        input_tokens: raw.inputTokens,
        output_tokens: raw.outputTokens,
        channel: ctx.channel,
      })
      .select('id')
      .maybeSingle();
    if (error) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.propose_new_item',
        outcome: 'failed',
        costUsd,
      });
      throw new Error(`proposal_insert_failed: ${error.message}`);
    }

    await recordInvocation(ctx.supabase, {
      tenantId: ctx.tenantId,
      intent: 'menu.propose_new_item',
      outcome: 'ok',
      costUsd,
    });

    const result: HandlerResult = {
      summary: `Propunere "${name}" salvată ca DRAFT (${price_ron.toFixed(2)} RON).`,
      data: {
        proposalId: data?.id ?? null,
        kind: 'new_item' as const,
        payload: finalPayload,
        rationale,
      },
    };
    return result;
  },
};

// `menu.mark_sold_out` — input: { item_id, item_name, reason?, until_iso }
const markSoldOutHandler: IntentHandler = {
  plan: async (_ctx, payload) => {
    const p = payload as Record<string, unknown>;
    if (!isUuid(p.item_id)) throw new Error('invalid_payload: item_id must be uuid');
    const item_name = nonEmptyString(p.item_name, 200);
    if (!item_name) throw new Error('invalid_payload: item_name missing');
    if (!isIsoDate(p.until_iso)) throw new Error('invalid_payload: until_iso must be ISO date');
    const reason = nonEmptyString(p.reason, 300) ?? '';
    return {
      actionCategory: 'proposal.create',
      summary: `Marcaj epuizat: "${item_name}" până la ${String(p.until_iso)}.`,
      resolvedPayload: { item_id: p.item_id, item_name, reason, until_iso: p.until_iso },
    };
  },
  execute: async (ctx, plan) => {
    const item_id = String(plan.resolvedPayload?.item_id ?? '');
    const item_name = String(plan.resolvedPayload?.item_name ?? '');
    const reason = String(plan.resolvedPayload?.reason ?? '');
    const until_iso = String(plan.resolvedPayload?.until_iso ?? '');

    const cap = await checkDailyCap(ctx.supabase, ctx.tenantId);
    if (cap.capped) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.mark_sold_out',
        outcome: 'capped',
      });
      throw new Error('daily_cap_reached');
    }

    const apiKey = await getApiKey();
    const userMessage = [
      `item_id: ${item_id}`,
      `item_name: ${item_name}`,
      `until_iso: ${until_iso}`,
      `Motiv intern (opțional): ${reason || '(niciun motiv specificat)'}`,
      'Generează JSON cu motivul reformulat pentru client.',
    ].join('\n');

    let raw: AnthropicResult;
    try {
      raw = await callAnthropic(apiKey, SYSTEM_PROMPT_SOLD_OUT, userMessage, 300);
    } catch (e) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.mark_sold_out',
        outcome: 'failed',
      });
      throw e;
    }

    let parsed: unknown;
    try {
      parsed = extractJson(raw.text);
    } catch (e) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.mark_sold_out',
        outcome: 'failed',
        costUsd: costUsdOf(raw.inputTokens, raw.outputTokens),
      });
      throw new Error(`anthropic_unparseable_json: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`);
    }

    const obj = parsed as Record<string, unknown>;
    if (!isUuid(obj.item_id) || obj.item_id !== item_id) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.mark_sold_out',
        outcome: 'failed',
        costUsd: costUsdOf(raw.inputTokens, raw.outputTokens),
      });
      throw new Error('anthropic_item_id_mismatch');
    }
    const customer_facing_reason = nonEmptyString(obj.customer_facing_reason, 280);
    if (!customer_facing_reason) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.mark_sold_out',
        outcome: 'failed',
        costUsd: costUsdOf(raw.inputTokens, raw.outputTokens),
      });
      throw new Error('anthropic_invalid_shape: customer_facing_reason missing');
    }
    if (!isIsoDate(obj.until_iso)) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.mark_sold_out',
        outcome: 'failed',
        costUsd: costUsdOf(raw.inputTokens, raw.outputTokens),
      });
      throw new Error('anthropic_invalid_shape: until_iso missing');
    }
    const finalPayload = {
      item_id,
      item_name,
      customer_facing_reason,
      until_iso: String(obj.until_iso),
    };
    const rationale = `Marcaj epuizat până la ${finalPayload.until_iso}. Motiv afișat clienților: "${customer_facing_reason}".`;
    const costUsd = costUsdOf(raw.inputTokens, raw.outputTokens);

    const { data, error } = await ctx.supabase
      .from('menu_agent_proposals')
      .insert({
        tenant_id: ctx.tenantId,
        kind: 'sold_out',
        status: 'DRAFT',
        payload: finalPayload,
        rationale,
        model: MENU_AGENT_MODEL,
        input_tokens: raw.inputTokens,
        output_tokens: raw.outputTokens,
        channel: ctx.channel,
      })
      .select('id')
      .maybeSingle();
    if (error) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.mark_sold_out',
        outcome: 'failed',
        costUsd,
      });
      throw new Error(`proposal_insert_failed: ${error.message}`);
    }

    await recordInvocation(ctx.supabase, {
      tenantId: ctx.tenantId,
      intent: 'menu.mark_sold_out',
      outcome: 'ok',
      costUsd,
    });

    return {
      summary: `Marcaj "${item_name}" epuizat — DRAFT pentru aprobare.`,
      data: { proposalId: data?.id ?? null, kind: 'sold_out' as const, payload: finalPayload, rationale },
    };
  },
};

// `menu.draft_promo` — input: { item_id, item_name, item_price_ron, brief }
const draftPromoHandler: IntentHandler = {
  plan: async (_ctx, payload) => {
    const p = payload as Record<string, unknown>;
    if (!isUuid(p.item_id)) throw new Error('invalid_payload: item_id must be uuid');
    const item_name = nonEmptyString(p.item_name, 200);
    if (!item_name) throw new Error('invalid_payload: item_name missing');
    const item_price_ron = nonNegNumber(p.item_price_ron, 10000);
    if (item_price_ron === null) throw new Error('invalid_payload: item_price_ron must be number');
    const brief = nonEmptyString(p.brief, 600);
    if (!brief) throw new Error('invalid_payload: brief missing');
    return {
      actionCategory: 'proposal.create',
      summary: `Promoție pentru "${item_name}": ${brief.slice(0, 80)}.`,
      resolvedPayload: { item_id: p.item_id, item_name, item_price_ron, brief },
    };
  },
  execute: async (ctx, plan) => {
    const item_id = String(plan.resolvedPayload?.item_id ?? '');
    const item_name = String(plan.resolvedPayload?.item_name ?? '');
    const item_price_ron = Number(plan.resolvedPayload?.item_price_ron ?? 0);
    const brief = String(plan.resolvedPayload?.brief ?? '');

    const cap = await checkDailyCap(ctx.supabase, ctx.tenantId);
    if (cap.capped) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.draft_promo',
        outcome: 'capped',
      });
      throw new Error('daily_cap_reached');
    }

    const apiKey = await getApiKey();
    const userMessage = [
      `item_id: ${item_id}`,
      `item_name: ${item_name}`,
      `preț curent (RON): ${item_price_ron}`,
      `Brief operator: ${brief}`,
      'Generează JSON cu propunerea de promoție.',
    ].join('\n');

    let raw: AnthropicResult;
    try {
      raw = await callAnthropic(apiKey, SYSTEM_PROMPT_PROMO, userMessage, 500);
    } catch (e) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.draft_promo',
        outcome: 'failed',
      });
      throw e;
    }

    let parsed: unknown;
    try {
      parsed = extractJson(raw.text);
    } catch (e) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.draft_promo',
        outcome: 'failed',
        costUsd: costUsdOf(raw.inputTokens, raw.outputTokens),
      });
      throw new Error(`anthropic_unparseable_json: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`);
    }

    const obj = parsed as Record<string, unknown>;
    if (!isUuid(obj.item_id) || obj.item_id !== item_id) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.draft_promo',
        outcome: 'failed',
        costUsd: costUsdOf(raw.inputTokens, raw.outputTokens),
      });
      throw new Error('anthropic_item_id_mismatch');
    }
    const discount_pct = nonNegNumber(obj.discount_pct, 90);
    if (discount_pct === null || !Number.isInteger(discount_pct) || discount_pct < 1) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.draft_promo',
        outcome: 'failed',
        costUsd: costUsdOf(raw.inputTokens, raw.outputTokens),
      });
      throw new Error('anthropic_invalid_shape: discount_pct out of range');
    }
    const headline = nonEmptyString(obj.headline, 80);
    const body = nonEmptyString(obj.body, 400);
    if (!headline || !body) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.draft_promo',
        outcome: 'failed',
        costUsd: costUsdOf(raw.inputTokens, raw.outputTokens),
      });
      throw new Error('anthropic_invalid_shape: headline or body missing');
    }
    if (!isIsoDate(obj.valid_from) || !isIsoDate(obj.valid_to)) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.draft_promo',
        outcome: 'failed',
        costUsd: costUsdOf(raw.inputTokens, raw.outputTokens),
      });
      throw new Error('anthropic_invalid_shape: valid_from / valid_to missing');
    }
    const fromMs = Date.parse(String(obj.valid_from));
    const toMs = Date.parse(String(obj.valid_to));
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    if (fromMs >= toMs || toMs - fromMs > THIRTY_DAYS_MS) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.draft_promo',
        outcome: 'failed',
        costUsd: costUsdOf(raw.inputTokens, raw.outputTokens),
      });
      throw new Error('anthropic_invalid_shape: promo window invalid (must be 0 < length <= 30d)');
    }

    const finalPayload = {
      item_id,
      item_name,
      discount_pct,
      headline,
      body,
      valid_from: String(obj.valid_from),
      valid_to: String(obj.valid_to),
    };
    const discounted = +(item_price_ron * (1 - discount_pct / 100)).toFixed(2);
    const rationale = `Reducere ${discount_pct}% pentru ${item_name} → ${discounted} RON. Valabilitate ${finalPayload.valid_from} – ${finalPayload.valid_to}.`;
    const costUsd = costUsdOf(raw.inputTokens, raw.outputTokens);

    const { data, error } = await ctx.supabase
      .from('menu_agent_proposals')
      .insert({
        tenant_id: ctx.tenantId,
        kind: 'promo',
        status: 'DRAFT',
        payload: finalPayload,
        rationale,
        model: MENU_AGENT_MODEL,
        input_tokens: raw.inputTokens,
        output_tokens: raw.outputTokens,
        channel: ctx.channel,
      })
      .select('id')
      .maybeSingle();
    if (error) {
      await recordInvocation(ctx.supabase, {
        tenantId: ctx.tenantId,
        intent: 'menu.draft_promo',
        outcome: 'failed',
        costUsd,
      });
      throw new Error(`proposal_insert_failed: ${error.message}`);
    }

    await recordInvocation(ctx.supabase, {
      tenantId: ctx.tenantId,
      intent: 'menu.draft_promo',
      outcome: 'ok',
      costUsd,
    });

    return {
      summary: `Promoție "${headline}" salvată ca DRAFT.`,
      data: { proposalId: data?.id ?? null, kind: 'promo' as const, payload: finalPayload, rationale },
    };
  },
};

// ---------------------------------------------------------------------------
// Registration — call this once on Edge Function cold start.
// Idempotent: registerIntent() ignores duplicates and warns to stderr.
// ---------------------------------------------------------------------------

export function registerMenuAgentIntents(): void {
  registerIntent({
    name: 'menu.propose_new_item',
    agent: 'menu',
    defaultCategory: 'proposal.create',
    description: 'Propune un produs nou pentru meniu (DRAFT, OWNER aprobă).',
    readOnly: true, // Staging-only; OWNER reviews under Sugestii Hepy. See file header.
    handler: proposeNewItemHandler,
  });
  registerIntent({
    name: 'menu.mark_sold_out',
    agent: 'menu',
    defaultCategory: 'proposal.create',
    description: 'Marchează un produs ca epuizat temporar (DRAFT, OWNER aprobă).',
    readOnly: true,
    handler: markSoldOutHandler,
  });
  registerIntent({
    name: 'menu.draft_promo',
    agent: 'menu',
    defaultCategory: 'proposal.create',
    description: 'Propune o promoție pentru un produs (DRAFT, OWNER aprobă).',
    readOnly: true,
    handler: draftPromoHandler,
  });
}

// Test-only export of internal handler refs so vitest can drive plan/
// execute directly without going through dispatchIntent. Production code
// uses dispatchIntent + the registry.
export const __TESTING__ = {
  proposeNewItemHandler,
  markSoldOutHandler,
  draftPromoHandler,
  checkDailyCap,
  recordInvocation,
};
