// HIR Marketing Agent V1 — Sprint 14
//
// Registers two intents with the Master Orchestrator (PR #341):
//
//   marketing.draft_post   — non-destructive WRITE that drafts copy for a
//                            social post and persists it to `marketing_drafts`.
//                            Default trust level: PROPOSE_ONLY (per
//                            tenant_agent_trust). When the OWNER opts the
//                            category up to AUTO_REVERSIBLE, drafts land
//                            directly with state=draft (still NOT published —
//                            see below).
//
//   marketing.publish_post — RESERVED. V1 deliberately throws
//                            `not_implemented_v1` from execute(). Wiring
//                            real publish to FB/IG/GMB is Sprint 16+ work
//                            (auth tokens, content policy, brand approval).
//                            We register the intent so the Trust UI shows
//                            it greyed-out rather than missing.
//
// Why DRAFT-only regardless of trust: Marketing copy that hits a public
// channel can damage a tenant's brand if generated content is wrong. V1
// puts a human eyeball between the LLM and the audience — the OWNER
// copy/pastes the draft. This is a scope cut, not a bug; documented in
// `feedback_overnight_merge_authority_2026-05-07.md` working notes.
//
// Pattern mirror: the growth-agent-daily Edge Function for the Anthropic
// SDK call (Sonnet 4.5 + prompt caching + 429 retry + RO-strict prompt +
// FORBIDDEN-term sanitiser). See that file for the operating-mode
// guardrails — re-implementing instead of extracting a helper because the
// growth agent ships per-tenant 30-day metrics whereas marketing ships
// per-call live signals; different prompt shape, same plumbing.
//
// Deno-compatible. Imported by `supabase/functions/marketing-agent-draft`
// (the cron/HTTP entry point) and by the per-tenant Telegram bot once
// /marketing draft is wired (Sprint 14 follow-up).

// Deno-style `.ts` extension imports — required by Supabase Edge runtime.
// The admin tsconfig sets `allowImportingTsExtensions` so the same file
// also parses cleanly under tsc when pulled in by the marketing-agent
// vitest. This mirrors how the growth-agent + other Edge Functions
// already import from `_shared/`.
import { registerIntent } from './master-orchestrator.ts';
import type {
  IntentHandler,
  HandlerContext,
  HandlerPlan,
  HandlerResult,
} from './master-orchestrator.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

// Forbidden-term policy. Marketing copy must NEVER leak fleet-network
// confidentiality on a tenant-facing channel. This is a strict superset
// of the growth-agent regex — the growth-agent variant misses the
// Romanian plural "subcontractori" because it terminates with `\b` after
// `subcontractor`, and `i` is a word-char so no boundary exists between
// them. We add explicit plural alternatives. NOT a fix to growth-agent
// (its outputs are RO recommendations, less brand-public than social
// copy); a follow-up issue tracks tightening that regex centrally.
const FORBIDDEN_TERMS =
  /\b(fleet|flot[aă]|subcontractor[ia]?|subcontractori|subcontracta(re|t)|broker|carrier partner)\b/i;

// Allowed enum values that the table CHECK constraint enforces. Keep in
// sync with `20260608_003_marketing_drafts.sql`.
const PLATFORMS = ['facebook', 'instagram', 'google_business', 'tiktok', 'generic'] as const;
const POST_TYPES = ['promo', 'announcement', 'engagement'] as const;
type Platform = typeof PLATFORMS[number];
type PostType = typeof POST_TYPES[number];

// ---------------------------------------------------------------------------
// Payload shapes — what the dispatcher's caller sends
// ---------------------------------------------------------------------------

export type MarketingDraftPayload = {
  // Optional explicit instructions from the OWNER (e.g. "promovați pizza
  // cuatru brânzeturi pentru weekend"). When omitted, the agent auto-picks
  // a hook from recent top items + weather.
  brief_ro?: string;
  // Force a specific platform. When omitted, agent defaults to 'facebook'.
  platform?: Platform;
  // Force a specific post type. When omitted, agent picks based on
  // available signals (e.g. 'promo' if rain forecast, 'announcement' if
  // a new item shipped in the last 7d).
  post_type?: PostType;
};

// What the LLM returns. Strict JSON; we sanitise before persisting.
type LLMDraft = {
  headline_ro?: string | null;
  body_ro: string;
  hashtags?: string | null;
  cta_ro?: string | null;
  rationale_ro?: string;
};

// ---------------------------------------------------------------------------
// Signal collection — pure read of tenant-facing data the LLM can use
// ---------------------------------------------------------------------------

type TenantSignals = {
  tenant_name: string;
  cuisine_types: string[];
  city_id: string | null;
  city_name: string | null;
  // Top items (last 30d) the agent can hook the post on.
  top_items: Array<{ name: string; revenue?: number }>;
  // Latest weather snapshot for the tenant's city, if any. Re-uses the
  // weather-snapshot table from PR #339.
  weather: {
    temp_c: number | null;
    weather_code: number | null;
    weather_desc: string | null;
  } | null;
  // ISO weekday for "weekend" / "luni dimineața" hooks.
  weekday: number; // 1 (Mon) .. 7 (Sun)
};

// Used to dampen tests + to give the LLM a deterministic anchor when no
// snapshot exists. Pure function, no side effects.
export function pickPostType(s: TenantSignals): PostType {
  // Rainy or snowy → comfort-food promo.
  const code = s.weather?.weather_code ?? null;
  if (code !== null) {
    const hundreds = Math.floor(code / 100);
    if (hundreds === 2 || hundreds === 3 || hundreds === 5 || hundreds === 6) return 'promo';
  }
  // Hot or cold extreme → promo.
  const t = s.weather?.temp_c ?? null;
  if (t !== null && (t >= 28 || t <= 5)) return 'promo';
  // Friday/Saturday → engagement (weekend energy).
  if (s.weekday === 5 || s.weekday === 6) return 'engagement';
  // Default → promo (most common ask from operators).
  return 'promo';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadSignals(supabase: any, tenantId: string): Promise<TenantSignals> {
  // Tenant header
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, cuisine_types, city_id')
    .eq('id', tenantId)
    .maybeSingle();

  // Resolve city name if we have a city_id (used in headlines like "în
  // Brașov, ploaie de duminică"). Best-effort; null if join misses.
  let cityName: string | null = null;
  if (tenant?.city_id) {
    const { data: city } = await supabase
      .from('cities')
      .select('id, name')
      .eq('id', tenant.city_id)
      .maybeSingle();
    cityName = city?.name ?? null;
  }

  // Top items from the existing growth materialized view (refreshed daily).
  // Best-effort: the view may not have a row for brand-new tenants.
  let topItems: TenantSignals['top_items'] = [];
  try {
    const { data: mv } = await supabase
      .from('mv_growth_tenant_metrics_30d')
      .select('top_items')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    const raw = mv?.top_items;
    if (Array.isArray(raw)) {
      topItems = raw
        .slice(0, 5)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((x: any) => ({
          name: String(x?.name ?? ''),
          revenue: Number(x?.revenue ?? 0),
        }))
        .filter((x: { name: string }) => x.name.length > 0);
    }
  } catch (_e) {
    // mv may not exist in some envs (test); fall through with empty.
  }

  // Latest weather snapshot for the city. The ingestion fn (PR #339) writes
  // one row per city per hour.
  let weather: TenantSignals['weather'] = null;
  if (tenant?.city_id) {
    try {
      const { data: w } = await supabase
        .from('weather_snapshots')
        .select('temp_c, weather_code, weather_desc')
        .eq('city_id', tenant.city_id)
        .order('snapshot_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (w) {
        weather = {
          temp_c: w.temp_c ?? null,
          weather_code: w.weather_code ?? null,
          weather_desc: w.weather_desc ?? null,
        };
      }
    } catch (_e) {
      // Snapshot table may be empty for a fresh city; non-fatal.
    }
  }

  // Day-of-week (1..7, ISO). Use UTC since Supabase Edge runs UTC; close
  // enough to RO local for "is it Friday-ish" decisions.
  const jsDow = new Date().getUTCDay(); // 0=Sun..6=Sat
  const weekday = jsDow === 0 ? 7 : jsDow;

  return {
    tenant_name: tenant?.name ?? '(restaurant)',
    cuisine_types: Array.isArray(tenant?.cuisine_types)
      ? (tenant.cuisine_types as string[])
      : [],
    city_id: tenant?.city_id ?? null,
    city_name: cityName,
    top_items: topItems,
    weather,
    weekday,
  };
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  'Esti Marketing Agent — sub-agent al "Hepy" (AI CEO al HIR Restaurant Suite).',
  'Rol: scrii UN draft de postare social media pentru un restaurant, in romana',
  'formala (foloseste "dumneavoastra" cand vorbesti cu clientii).',
  '',
  'REGULI ABSOLUT OBLIGATORII:',
  '1. Toate textele clientului final sunt in ROMANA, formal.',
  '2. NU folositi termenii "fleet", "flota", "subcontractor", "broker",',
  '   "carrier partner". Curierii sunt mereu "echipa noastra de livrare" sau',
  '   "curier HIR" daca trebuie sa pomeniti livrarea.',
  '3. NU pomeniti tarife sau abonamente HIR (1 RON / livrare etc.). Nu',
  '   sugerati Wolt, Glovo, Bolt Food, Tazz, FoodPanda. Comanda se face pe',
  '   storefront-ul restaurantului.',
  '4. NU faceti afirmatii de sanatate ("scade colesterolul", "vindeca") sau',
  '   pretenții garantate. Tonul = invitatie calduroasa, nu agresiv-comercial.',
  '5. NU includeti emoji excesiv (max 2 per draft).',
  '6. Iesirea TREBUIE sa fie JSON strict, fara markdown, fara cod-fence.',
  '',
  'FORMAT RASPUNS (JSON strict):',
  '{',
  '  "headline_ro": "string sau null (max 80 caractere) — folosit pe FB/GMB",',
  '  "body_ro": "string (60-220 caractere) — corpul postarii",',
  '  "hashtags": "string sau null — 3-5 hashtaguri scurte separate de spatiu",',
  '  "cta_ro": "string sau null — call-to-action scurt (max 60 caractere)",',
  '  "rationale_ro": "string scurt — de ce ati ales unghiul asta"',
  '}',
].join('\n');

function buildUserPrompt(
  s: TenantSignals,
  payload: MarketingDraftPayload,
  platform: Platform,
  postType: PostType,
): string {
  const lines: string[] = [];
  lines.push(`Restaurant: ${s.tenant_name}`);
  if (s.cuisine_types.length > 0) lines.push(`Tip bucatarie: ${s.cuisine_types.join(', ')}`);
  if (s.city_name) lines.push(`Oras: ${s.city_name}`);
  lines.push(`Platforma tinta: ${platform}`);
  lines.push(`Tip postare: ${postType}`);
  lines.push(
    `Ziua saptamanii (1=Luni..7=Duminica): ${s.weekday}`,
  );
  lines.push('');

  if (s.weather) {
    const t = s.weather.temp_c !== null ? `${s.weather.temp_c.toFixed(0)}°C` : 'temperatura necunoscuta';
    const desc = s.weather.weather_desc ?? 'fara descriere';
    lines.push(`Vreme curenta: ${t}, ${desc}.`);
  } else {
    lines.push('Vreme curenta: indisponibila.');
  }
  lines.push('');

  if (s.top_items.length > 0) {
    lines.push('Top produse vandute (30 zile):');
    for (const it of s.top_items) {
      lines.push(`- ${it.name}`);
    }
  } else {
    lines.push('Top produse: nu sunt date suficiente.');
  }
  lines.push('');

  if (payload.brief_ro && payload.brief_ro.trim().length > 0) {
    lines.push('Brief de la proprietar (prioritar):');
    lines.push(payload.brief_ro.trim().slice(0, 500));
  } else {
    lines.push(
      'Fara brief explicit. Alegeti unghiul cel mai relevant pe baza vremii + top produse + ziua saptamanii.',
    );
  }
  lines.push('');
  lines.push('Va rog sa generati UN singur draft, in JSON strict, conform schemei.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// LLM call — Sonnet 4.5 + prompt caching + 429 retry
// ---------------------------------------------------------------------------

async function callSonnet(
  apiKey: string,
  model: string,
  userMessage: string,
): Promise<{ draft: LLMDraft; cost_usd: number }> {
  let res!: Response;
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (res.status !== 429 || attempt === 1) break;
    const retryAfterRaw = res.headers.get('retry-after') ?? '';
    const retryAfterSec = Number(retryAfterRaw);
    const waitMs =
      Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.min(retryAfterSec, 30) * 1000
        : 5_000;
    await new Promise((r) => setTimeout(r, waitMs));
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`anthropic_${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const text: string =
    Array.isArray(data?.content) && data.content[0]?.type === 'text'
      ? data.content[0].text
      : '';
  if (!text) throw new Error('anthropic_empty_response');

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: LLMDraft;
  try {
    parsed = JSON.parse(cleaned) as LLMDraft;
  } catch {
    throw new Error(`anthropic_unparseable_json: ${cleaned.slice(0, 200)}`);
  }
  if (!parsed || typeof parsed.body_ro !== 'string' || parsed.body_ro.length === 0) {
    throw new Error('anthropic_bad_shape: missing body_ro');
  }

  // Sonnet 4.5 pricing (per 1M tokens, USD): in $3, cache_w $3.75, cache_r
  // $0.30, out $15. Same accounting growth-agent uses.
  const usage = data?.usage ?? {};
  const inTok = Number(usage.input_tokens ?? 0);
  const cacheWrite = Number(usage.cache_creation_input_tokens ?? 0);
  const cacheRead = Number(usage.cache_read_input_tokens ?? 0);
  const outTok = Number(usage.output_tokens ?? 0);
  const cost =
    (inTok * 3.0 + cacheWrite * 3.75 + cacheRead * 0.3 + outTok * 15.0) / 1_000_000;

  return { draft: parsed, cost_usd: cost };
}

// ---------------------------------------------------------------------------
// Sanitiser — runs FORBIDDEN-term + length caps before persisting
// ---------------------------------------------------------------------------

export function sanitizeDraft(d: LLMDraft): LLMDraft | null {
  if (!d.body_ro || d.body_ro.trim().length === 0) return null;
  const fields = [d.headline_ro ?? '', d.body_ro, d.hashtags ?? '', d.cta_ro ?? ''];
  for (const f of fields) {
    if (FORBIDDEN_TERMS.test(f)) return null;
  }
  return {
    headline_ro: d.headline_ro ? d.headline_ro.slice(0, 80) : null,
    body_ro: d.body_ro.slice(0, 600),
    hashtags: d.hashtags ? d.hashtags.slice(0, 200) : null,
    cta_ro: d.cta_ro ? d.cta_ro.slice(0, 60) : null,
    rationale_ro: d.rationale_ro ? d.rationale_ro.slice(0, 280) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Handler — plan + execute
// ---------------------------------------------------------------------------

// Two-phase plan: load signals (read-only), pick platform + post type,
// echo into the resolved payload so a future Approve replay has the same
// inputs the original draft saw.
async function planDraft(
  ctx: HandlerContext,
  payload: Record<string, unknown>,
): Promise<HandlerPlan> {
  const p = payload as MarketingDraftPayload;
  const signals = await loadSignals(ctx.supabase, ctx.tenantId);

  const platform: Platform = PLATFORMS.includes(p.platform as Platform)
    ? (p.platform as Platform)
    : 'facebook';
  const postType: PostType = POST_TYPES.includes(p.post_type as PostType)
    ? (p.post_type as PostType)
    : pickPostType(signals);

  const summary = `Draft postare ${platform}/${postType} pentru ${signals.tenant_name}`;

  return {
    actionCategory: 'social.draft',
    summary,
    // No pre_state — drafting is purely additive (no row gets overwritten).
    // Revert is "discard the draft", which the UI handles by status flip,
    // not via dispatcher revert.
    resolvedPayload: {
      brief_ro: p.brief_ro ?? null,
      platform,
      post_type: postType,
      // Persist signals snapshot so the LLM call is deterministic on
      // replay (modulo Anthropic non-determinism, which is fine for v1).
      signals,
    },
  };
}

async function executeDraft(
  ctx: HandlerContext,
  plan: HandlerPlan,
): Promise<HandlerResult> {
  const apiKey = (globalThis as { Deno?: { env: { get: (k: string) => string | undefined } } })
    .Deno?.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('anthropic_env_missing');
  const model =
    (globalThis as { Deno?: { env: { get: (k: string) => string | undefined } } }).Deno?.env.get(
      'ANTHROPIC_MODEL_SONNET',
    ) ?? DEFAULT_MODEL;

  const rp = (plan.resolvedPayload ?? {}) as {
    brief_ro: string | null;
    platform: Platform;
    post_type: PostType;
    signals: TenantSignals;
  };

  const userPrompt = buildUserPrompt(
    rp.signals,
    { brief_ro: rp.brief_ro ?? undefined, platform: rp.platform, post_type: rp.post_type },
    rp.platform,
    rp.post_type,
  );

  const { draft, cost_usd } = await callSonnet(apiKey, model, userPrompt);
  const clean = sanitizeDraft(draft);
  if (!clean) {
    // Reject the whole draft — surface a clear summary so the OWNER sees
    // why nothing landed. The dispatcher writes an EXECUTED ledger row
    // anyway (failed-but-attempted is auditable).
    return {
      summary: 'Draft respins de filtrul de termeni interziși; nu a fost salvat.',
      data: { ok: false, reason: 'forbidden_terms' },
    };
  }

  // Persist the draft. We store cost_usd + model + source_run_id so AI
  // Activity can join back. source_run_id is filled with null here
  // because the dispatcher writes its ledger row AFTER execute() returns;
  // the draft row will not have a back-reference (acceptable for V1 — UI
  // joins via tenant + recency).
  const insertPayload = {
    restaurant_id: ctx.tenantId,
    platform: rp.platform,
    post_type: rp.post_type,
    headline_ro: clean.headline_ro,
    body_ro: clean.body_ro,
    hashtags: clean.hashtags,
    cta_ro: clean.cta_ro,
    status: 'draft',
    source_signals: rp.signals,
    model,
    cost_usd: Number(cost_usd.toFixed(6)),
  };
  const { data: row, error } = await ctx.supabase
    .from('marketing_drafts')
    .insert(insertPayload)
    .select('id')
    .maybeSingle();
  if (error) {
    throw new Error(`marketing_drafts_insert_failed: ${error.message}`);
  }
  const draftId = row?.id as string | undefined;

  return {
    summary: `Draft salvat (${rp.platform}/${rp.post_type}). Verificați în Marketing → Drafturi.`,
    data: {
      ok: true,
      draft_id: draftId ?? null,
      cost_usd: Number(cost_usd.toFixed(6)),
      headline_ro: clean.headline_ro,
      body_ro: clean.body_ro,
    },
  };
}

const draftHandler: IntentHandler = {
  plan: planDraft,
  execute: executeDraft,
};

const publishHandler: IntentHandler = {
  // Plan succeeds — we want the UI to show "publication intent received".
  plan: async (_ctx, _payload) => ({
    actionCategory: 'social.publish',
    summary: 'Publicare draft pe canal extern (V1: indisponibil).',
  }),
  // Execute deliberately throws so the dispatcher returns
  // `handler_threw` and the OWNER sees a clear V1 boundary.
  execute: async () => {
    throw new Error('not_implemented_v1: publishing is operator-manual in V1');
  },
};

// ---------------------------------------------------------------------------
// Public registration entrypoint
// ---------------------------------------------------------------------------

// Idempotent: registerIntent itself dedups by name (warns on dupe).
let registered = false;
export function registerMarketingAgent(): void {
  if (registered) return;
  registered = true;

  registerIntent({
    name: 'marketing.draft_post',
    agent: 'marketing',
    defaultCategory: 'social.draft',
    description: 'Generează draft de postare social media (RO formal).',
    handler: draftHandler,
  });

  registerIntent({
    name: 'marketing.publish_post',
    agent: 'marketing',
    defaultCategory: 'social.publish',
    description:
      'Publică o postare social. V1: indisponibil — proprietarul publică manual draftul.',
    handler: publishHandler,
  });
}

// ---------------------------------------------------------------------------
// Test-only helper — lets vitest reset module state between cases.
// ---------------------------------------------------------------------------

export function __resetRegisteredForTesting(): void {
  registered = false;
}
