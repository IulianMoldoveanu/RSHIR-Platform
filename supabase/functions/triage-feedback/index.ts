// HIR Restaurant Suite — Triage Agent for Vendor Feedback (Phase 2)
//
// Triggered by AFTER INSERT on public.feedback_reports via pg_net (see
// migration 20260504_004_triage_columns.sql). Calls Anthropic Claude Haiku 4.5
// with a cached system prompt to classify the report (category, severity,
// auto-fix eligibility, dedupe match).
//
// Writes results back to feedback_reports.triage_* columns and sets
// status='TRIAGED'. If severity is P0 or P1, sends a Telegram alert with
// inline-keyboard buttons that hand off to telegram-command-intake (built by
// the AI Chief in parallel).
//
// Cost target: < $0.001 per call via prompt caching on the system message.
//
// Env (Supabase function secrets):
//   HIR_NOTIFY_SECRET           shared with the DB trigger
//   ANTHROPIC_API_KEY           Anthropic API key
//   TELEGRAM_BOT_TOKEN          MasterBOT token
//   TELEGRAM_IULIAN_CHAT_ID     Iulian's personal chat_id
// Auto-injected by Edge runtime: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
// Lane 9 observability — additive wrap, never changes behavior.
import { withRunLog } from '../_shared/log.ts';

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

type Body = { feedback_id: string; tenant_id: string | null };

type TriageOutput = {
  category: 'BUG' | 'UX_FRICTION' | 'FEATURE_REQUEST' | 'QUESTION' | 'DUPLICATE';
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  auto_fix_eligible: boolean;
  auto_fix_scope:
    | null
    | 'ui-text'
    | 'a11y'
    | 'validation'
    | 'loading-state'
    | 'error-message'
    | 'missing-null-check';
  dedupe_of: string | null;
  confidence: number;
  reasoning: string;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const SYSTEM_PROMPT = `You are the Triage Agent for the HIR Restaurant Suite platform.

Your job: classify each vendor feedback report submitted from the merchant dashboard. Output STRICT JSON ONLY (no markdown, no prose around it).

Output schema:
{
  "category": "BUG" | "UX_FRICTION" | "FEATURE_REQUEST" | "QUESTION" | "DUPLICATE",
  "severity": "P0" | "P1" | "P2" | "P3",
  "auto_fix_eligible": boolean,
  "auto_fix_scope": null | "ui-text" | "a11y" | "validation" | "loading-state" | "error-message" | "missing-null-check",
  "dedupe_of": null | "<uuid of similar open ticket from the provided list>",
  "confidence": 0.0..1.0,
  "reasoning": "one short paragraph"
}

Severity rubric (be strict, use the highest applicable):
- P0: storefront down, can't checkout, can't log in, payment broken, data loss, missing critical data, security incident.
- P1: feature visibly broken with no obvious workaround; major UX friction; blocks an important task.
- P2: minor UX friction, copy issue, slow load, confusing layout, ambiguous error.
- P3: cosmetic, suggestion, nice-to-have.

Category rubric:
- BUG: something is broken vs. expected behavior.
- UX_FRICTION: works but is confusing/painful.
- FEATURE_REQUEST: net-new functionality.
- QUESTION: vendor needs help, not a defect.
- DUPLICATE: this report matches a recent open ticket (set dedupe_of).

Auto-fix eligibility (set true ONLY IF ALL of):
- category is BUG or UX_FRICTION.
- severity is P2 or P3 (NEVER auto-fix P0/P1 — they need human review).
- auto_fix_scope is in: ui-text | a11y | validation | loading-state | error-message | missing-null-check.
- description plus any console excerpt contain enough info for a small code change (≤3 files, ≤50 lines).

Deduplication: the input includes up to 10 most recent open tickets in the same tenant. Match if same URL + same error pattern, OR description >70% semantically similar. If matched, set category="DUPLICATE", dedupe_of="<uuid>", auto_fix_eligible=false.

Confidence: be honest. < 0.6 means you're guessing — set auto_fix_eligible=false in that case.

Reasoning: one short paragraph (≤300 chars), in English. Explain the call.

Romanian + English are both common in feedback. Process either fluently. Romanian merchant errors like "nu pot să" / "nu funcționează" / "blocat" are common P0/P1 signals; "ar fi mai bine dacă" / "ar trebui" are usually P3 feature requests.

Output ONLY the JSON object. No prefix, no suffix, no code fence.`;

type FeedbackRow = {
  id: string;
  tenant_id: string | null;
  category: string;
  description: string | null;
  url: string | null;
  user_agent: string | null;
  console_log_excerpt: string | null;
  created_at: string;
  tenants: { slug: string | null; name: string | null } | null;
};

type RecentOpen = {
  id: string;
  description: string | null;
  url: string | null;
  category: string | null;
  triage_category: string | null;
  status: string;
  created_at: string;
};

function buildUserMessage(row: FeedbackRow, recentOpen: RecentOpen[]): string {
  const tenantLabel = row.tenants?.slug
    ? `${row.tenants.slug}${row.tenants.name ? ` (${row.tenants.name})` : ''}`
    : '(no tenant)';
  const recentBlock =
    recentOpen.length === 0
      ? '(no recent open tickets)'
      : recentOpen
          .map(
            (r, i) =>
              `[${i + 1}] id=${r.id} status=${r.status} cat=${r.category ?? '?'} url=${r.url ?? '?'}\n` +
              `    ${(r.description ?? '').slice(0, 220).replace(/\s+/g, ' ')}`,
          )
          .join('\n');
  const consoleBlock =
    typeof row.console_log_excerpt === 'string' && row.console_log_excerpt.length > 0
      ? row.console_log_excerpt.slice(0, 4000)
      : '(none)';
  return [
    `New feedback to triage:`,
    `id: ${row.id}`,
    `tenant: ${tenantLabel}`,
    `reported_category: ${row.category}`,
    `url: ${row.url ?? '(none)'}`,
    `user_agent: ${(row.user_agent ?? '').slice(0, 200)}`,
    `description:`,
    row.description ?? '(none)',
    ``,
    `console_log_excerpt:`,
    consoleBlock,
    ``,
    `Recent open tickets in same tenant (for dedupe):`,
    recentBlock,
    ``,
    `Output strict JSON.`,
  ].join('\n');
}

async function callTriage(apiKey: string, userMessage: string): Promise<{
  output: TriageOutput;
  cost_usd: number;
  raw_usage: unknown;
}> {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 600,
      // Cache the system prompt — same string every call → cache hit on repeat.
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
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

  let parsed: TriageOutput;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`anthropic_unparseable_json: ${cleaned.slice(0, 200)}`);
  }

  // Haiku 4.5 pricing per 1M tokens (USD): input $1.00, cache_write $1.25,
  // cache_read $0.10, output $5.00. Warm-cache calls are ~$0.0009.
  const usage = data?.usage ?? {};
  const inTok = Number(usage.input_tokens ?? 0);
  const cacheWrite = Number(usage.cache_creation_input_tokens ?? 0);
  const cacheRead = Number(usage.cache_read_input_tokens ?? 0);
  const outTok = Number(usage.output_tokens ?? 0);
  const cost =
    (inTok * 1.0 + cacheWrite * 1.25 + cacheRead * 0.1 + outTok * 5.0) / 1_000_000;

  return { output: parsed, cost_usd: cost, raw_usage: usage };
}

async function dispatchSeverityTelegram(opts: {
  token: string;
  chatId: string;
  feedbackId: string;
  severity: 'P0' | 'P1';
  tenantLabel: string;
  reasoning: string;
}): Promise<void> {
  const adminUrl = `https://hir-restaurant-admin.vercel.app/dashboard/feedback/${opts.feedbackId}`;
  const summary = opts.reasoning.slice(0, 120);
  const prefix = opts.severity === 'P0' ? '🚨🚨🚨' : '⚠️';
  const text = [
    `${prefix} <b>${opts.severity} / RSHIR-Platform vendor / ${escapeHtml(opts.tenantLabel)}</b>`,
    escapeHtml(summary),
    `🔗 ${escapeHtml(adminUrl)}`,
  ].join('\n');

  const r = await fetch(`https://api.telegram.org/bot${opts.token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: opts.chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      // Inline buttons handed to telegram-command-intake (built in parallel).
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Fix Auto', callback_data: `fix:feedback:${opts.feedbackId}` },
            { text: 'Manual', callback_data: `manual:feedback:${opts.feedbackId}` },
          ],
        ],
      },
    }),
  });
  if (!r.ok) console.warn('[triage-feedback] telegram failed', r.status, await r.text());
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  return withRunLog('triage-feedback', async ({ setMetadata }) => {
  const expected = Deno.env.get('HIR_NOTIFY_SECRET');
  if (!expected) return json(500, { error: 'secret_not_configured' });
  const got = req.headers.get('x-hir-notify-secret') ?? '';
  if (got.length !== expected.length) return json(401, { error: 'unauthorized' });
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  if (diff !== 0) return json(401, { error: 'unauthorized' });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (!isUuid(body.feedback_id)) return json(400, { error: 'invalid_body' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'supabase_env_missing' });
  if (!ANTHROPIC_KEY) return json(500, { error: 'anthropic_env_missing' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error: rowErr } = await admin
    .from('feedback_reports')
    .select(
      'id, tenant_id, category, description, url, user_agent, console_log_excerpt, created_at, ' +
        'tenants:tenant_id ( slug, name )',
    )
    .eq('id', body.feedback_id)
    .maybeSingle<FeedbackRow>();
  if (rowErr || !row) {
    console.error('[triage-feedback] lookup failed:', rowErr?.message);
    return json(404, { error: 'feedback_not_found' });
  }

  // Pull last 10 open tickets in same tenant (excluding this one) for dedupe.
  let recent: RecentOpen[] = [];
  if (row.tenant_id) {
    const { data, error } = await admin
      .from('feedback_reports')
      .select('id, description, url, category, triage_category, status, created_at')
      .eq('tenant_id', row.tenant_id)
      .neq('id', row.id)
      .in('status', ['NEW', 'TRIAGED', 'FIX_ATTEMPTED', 'FIX_PROPOSED', 'HUMAN_FIX_NEEDED'])
      .order('created_at', { ascending: false })
      .limit(10);
    if (!error && Array.isArray(data)) recent = data as RecentOpen[];
  }

  const userMessage = buildUserMessage(row, recent);

  let triage: TriageOutput;
  let costUsd = 0;
  let usage: unknown = null;
  try {
    const r = await callTriage(ANTHROPIC_KEY, userMessage);
    triage = r.output;
    costUsd = r.cost_usd;
    usage = r.raw_usage;
  } catch (e) {
    console.error('[triage-feedback] anthropic failed:', (e as Error).message);
    return json(502, { error: 'anthropic_failed', detail: (e as Error).message });
  }

  // Validate output shape defensively before writing.
  const allowedCategories = ['BUG', 'UX_FRICTION', 'FEATURE_REQUEST', 'QUESTION', 'DUPLICATE'];
  const allowedSeverities = ['P0', 'P1', 'P2', 'P3'];
  const allowedScopes = [
    null,
    'ui-text',
    'a11y',
    'validation',
    'loading-state',
    'error-message',
    'missing-null-check',
  ];
  if (
    !allowedCategories.includes(triage.category) ||
    !allowedSeverities.includes(triage.severity) ||
    typeof triage.auto_fix_eligible !== 'boolean' ||
    !allowedScopes.includes(triage.auto_fix_scope ?? null) ||
    typeof triage.confidence !== 'number'
  ) {
    console.error('[triage-feedback] bad output shape', triage);
    return json(502, { error: 'anthropic_bad_shape' });
  }

  // Belt-and-suspenders eligibility check (server enforces, doesn't trust LLM).
  const eligibilityOk =
    triage.auto_fix_eligible &&
    (triage.category === 'BUG' || triage.category === 'UX_FRICTION') &&
    (triage.severity === 'P2' || triage.severity === 'P3') &&
    triage.auto_fix_scope !== null &&
    triage.confidence >= 0.6;

  // Dedupe: only accept dedupe_of if it's in the recent list we sent.
  const recentIds = new Set(recent.map(r => r.id));
  const dedupeOf =
    triage.dedupe_of && recentIds.has(triage.dedupe_of) ? triage.dedupe_of : null;

  const status = dedupeOf ? 'DUPLICATE' : 'TRIAGED';

  const { error: updErr } = await admin
    .from('feedback_reports')
    .update({
      severity: triage.severity,
      triage_category: triage.category,
      triage_dedupe_of: dedupeOf,
      triage_confidence: triage.confidence,
      triage_reasoning: triage.reasoning,
      triage_auto_fix_eligible: eligibilityOk,
      triage_auto_fix_scope: eligibilityOk ? triage.auto_fix_scope : null,
      triage_routed_to_fix: eligibilityOk,
      triage_at: new Date().toISOString(),
      status,
    })
    .eq('id', row.id);
  if (updErr) {
    console.error('[triage-feedback] update failed:', updErr.message);
    return json(500, { error: 'update_failed', detail: updErr.message });
  }

  // P0/P1 alert with inline buttons. EdgeRuntime.waitUntil keeps the response
  // fast while the Telegram dispatch finishes in the background.
  const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const tgChat = Deno.env.get('TELEGRAM_IULIAN_CHAT_ID');
  if (tgToken && tgChat && (triage.severity === 'P0' || triage.severity === 'P1')) {
    const tenantLabel = row.tenants?.slug
      ? `${row.tenants.slug}${row.tenants.name ? ` (${row.tenants.name})` : ''}`
      : '(no tenant)';
    const dispatch = dispatchSeverityTelegram({
      token: tgToken,
      chatId: tgChat,
      feedbackId: row.id,
      severity: triage.severity,
      tenantLabel,
      reasoning: triage.reasoning,
    }).catch(e => console.warn('[triage-feedback] tg dispatch error', e));
    try {
      EdgeRuntime.waitUntil(dispatch);
    } catch {
      dispatch.catch(() => {});
    }
  }

  setMetadata({
    feedback_id: row.id,
    tenant_id: row.tenant_id ?? null,
    severity: triage.severity,
    category: triage.category,
    auto_fix_eligible: eligibilityOk,
    confidence: triage.confidence,
    cost_usd: Number(costUsd.toFixed(6)),
  });

  return json(200, {
    ok: true,
    id: row.id,
    severity: triage.severity,
    category: triage.category,
    auto_fix_eligible: eligibilityOk,
    auto_fix_scope: eligibilityOk ? triage.auto_fix_scope : null,
    dedupe_of: dedupeOf,
    confidence: triage.confidence,
    cost_usd: costUsd,
    usage,
  });
  });
});
