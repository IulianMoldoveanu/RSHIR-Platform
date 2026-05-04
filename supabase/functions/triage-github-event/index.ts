// HIR Restaurant Suite — Triage Agent for GitHub PR Events (Phase 2)
//
// Triggered by AFTER INSERT on public.github_pr_events via pg_net (see
// migration 20260504_004_triage_columns.sql). Only fires for severity in
// (CRITICAL, WARN). Runs Claude Haiku 4.5 with a cached system prompt to
// decide whether the event is actionable for an AI Fix Agent or just noise.
//
// Output JSON written into github_pr_events.triage_decision:
//   {actionable, scope, confidence, reasoning}
// where scope ∈ ui-text | a11y | validation | lint | other | human-only.
//
// If actionable + scope in {ui-text, a11y, validation, lint}: marks
// triage_routed_to_fix=true so the Fix Agent (Phase 3) can pick it up.
//
// Cost target: < $0.001 per call via prompt caching.
//
// Env: HIR_NOTIFY_SECRET, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

type Body = { event_id: string };

type Scope = 'ui-text' | 'a11y' | 'validation' | 'lint' | 'other' | 'human-only';

type TriageOutput = {
  actionable: boolean;
  scope: Scope;
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

const SYSTEM_PROMPT = `You are the Triage Agent for GitHub events on the HIR Restaurant Suite repo (IulianMoldoveanu/RSHIR-Platform).

You receive a single GitHub event (PR comment, review, CI check, workflow run) classified as CRITICAL or WARN by the upstream webhook. Your job: decide whether an AI Fix Agent could plausibly resolve this without human input, OR whether it's noise / human-only.

Output STRICT JSON ONLY (no markdown):
{
  "actionable": boolean,
  "scope": "ui-text" | "a11y" | "validation" | "lint" | "other" | "human-only",
  "confidence": 0.0..1.0,
  "reasoning": "one short paragraph"
}

actionable=true means: a small, scoped code change (≤3 files, ≤50 lines) by an LLM Fix Agent could plausibly fix the issue. Only set actionable=true if scope is one of: ui-text, a11y, validation, lint.

Scope rubric:
- ui-text: copy/translation/typo/microcopy issues.
- a11y: missing aria-labels, role attributes, focus management, contrast.
- validation: missing/wrong form validation, null-checks, defensive guards.
- lint: typecheck error, ESLint rule violation, import error, missing dep usage.
- other: bug or comment that requires real engineering judgment beyond the scopes above.
- human-only: review feedback, design discussion, architecture comment, vague complaint, security incident, schema change, payment/auth/courier critical paths.

Common patterns:
- "Module 'X' not found" → lint, actionable.
- "Cannot read properties of undefined" with stack trace → validation, actionable IF stack points to non-critical UI code.
- "ReferenceError" / "is not a function" → lint or validation, actionable.
- Codex review comments asking for refactor / architecture changes → human-only.
- Vercel deploy failures with no clear error line → human-only.
- "ENOENT" / missing file → lint, actionable.
- Test failures with assertion mismatch → other (need to read the test) → human-only at this stage.
- changes_requested reviews → human-only.
- Workflow failure on a courier/payments/auth path → human-only (deny path).

Confidence: be honest. < 0.6 → set actionable=false.

Output ONLY the JSON.`;

type EventRow = {
  id: string;
  event_type: string;
  repo: string;
  pr_number: number | null;
  pr_title: string | null;
  pr_head_sha: string | null;
  actor: string | null;
  severity: string;
  summary: string | null;
  raw_payload: Record<string, unknown> | null;
};

function buildUserMessage(row: EventRow): string {
  // Slim raw_payload to keep token use low: only keep the most useful fields.
  const rp = row.raw_payload ?? {};
  const slim: Record<string, unknown> = {};
  const checkRun = (rp as any).check_run;
  if (checkRun) {
    slim.check_run = {
      name: checkRun.name,
      conclusion: checkRun.conclusion,
      status: checkRun.status,
      output: {
        title: checkRun.output?.title,
        summary: (checkRun.output?.summary ?? '').slice(0, 1500),
        text: (checkRun.output?.text ?? '').slice(0, 1500),
      },
    };
  }
  const review = (rp as any).review;
  if (review) {
    slim.review = {
      state: review.state,
      body: (review.body ?? '').slice(0, 1500),
    };
  }
  const comment = (rp as any).comment;
  if (comment) {
    slim.comment = {
      body: (comment.body ?? '').slice(0, 1500),
      user_login: comment.user?.login,
      user_type: comment.user?.type,
    };
  }
  const wfRun = (rp as any).workflow_run;
  if (wfRun) {
    slim.workflow_run = {
      name: wfRun.name,
      conclusion: wfRun.conclusion,
      head_branch: wfRun.head_branch,
    };
  }

  return [
    `GitHub event to triage:`,
    `id: ${row.id}`,
    `repo: ${row.repo}`,
    `event_type: ${row.event_type}`,
    `severity: ${row.severity}`,
    `actor: ${row.actor ?? '(unknown)'}`,
    `pr: ${row.pr_number ? `#${row.pr_number} — ${row.pr_title ?? ''}` : '(no PR)'}`,
    `summary: ${row.summary ?? '(none)'}`,
    ``,
    `relevant_payload:`,
    JSON.stringify(slim, null, 2).slice(0, 4000),
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
      max_tokens: 500,
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
  const usage = data?.usage ?? {};
  const inTok = Number(usage.input_tokens ?? 0);
  const cacheWrite = Number(usage.cache_creation_input_tokens ?? 0);
  const cacheRead = Number(usage.cache_read_input_tokens ?? 0);
  const outTok = Number(usage.output_tokens ?? 0);
  const cost =
    (inTok * 1.0 + cacheWrite * 1.25 + cacheRead * 0.1 + outTok * 5.0) / 1_000_000;
  return { output: parsed, cost_usd: cost, raw_usage: usage };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

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
  if (!isUuid(body.event_id)) return json(400, { error: 'invalid_body' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'supabase_env_missing' });
  if (!ANTHROPIC_KEY) return json(500, { error: 'anthropic_env_missing' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error: rowErr } = await admin
    .from('github_pr_events')
    .select(
      'id, event_type, repo, pr_number, pr_title, pr_head_sha, actor, severity, summary, raw_payload',
    )
    .eq('id', body.event_id)
    .maybeSingle<EventRow>();
  if (rowErr || !row) {
    console.error('[triage-github-event] lookup failed:', rowErr?.message);
    return json(404, { error: 'event_not_found' });
  }

  if (row.severity !== 'CRITICAL' && row.severity !== 'WARN') {
    // Defensive: trigger should have filtered these out.
    return json(200, { ok: true, skipped: true, reason: 'severity_not_actionable' });
  }

  const userMessage = buildUserMessage(row);

  let triage: TriageOutput;
  let costUsd = 0;
  let usage: unknown = null;
  try {
    const r = await callTriage(ANTHROPIC_KEY, userMessage);
    triage = r.output;
    costUsd = r.cost_usd;
    usage = r.raw_usage;
  } catch (e) {
    console.error('[triage-github-event] anthropic failed:', (e as Error).message);
    return json(502, { error: 'anthropic_failed', detail: (e as Error).message });
  }

  const allowedScopes: Scope[] = [
    'ui-text',
    'a11y',
    'validation',
    'lint',
    'other',
    'human-only',
  ];
  if (
    typeof triage.actionable !== 'boolean' ||
    !allowedScopes.includes(triage.scope) ||
    typeof triage.confidence !== 'number'
  ) {
    console.error('[triage-github-event] bad output shape', triage);
    return json(502, { error: 'anthropic_bad_shape' });
  }

  // Belt-and-suspenders: only route to Fix Agent if scope is in the actionable set.
  const fixActionable =
    triage.actionable &&
    triage.confidence >= 0.6 &&
    (triage.scope === 'ui-text' ||
      triage.scope === 'a11y' ||
      triage.scope === 'validation' ||
      triage.scope === 'lint');

  const decision = {
    actionable: fixActionable,
    scope: triage.scope,
    confidence: triage.confidence,
    reasoning: triage.reasoning,
    raw_actionable: triage.actionable,
  };

  const { error: updErr } = await admin
    .from('github_pr_events')
    .update({
      triage_decision: decision,
      triage_at: new Date().toISOString(),
      triage_routed_to_fix: fixActionable,
    })
    .eq('id', row.id);
  if (updErr) {
    console.error('[triage-github-event] update failed:', updErr.message);
    return json(500, { error: 'update_failed', detail: updErr.message });
  }

  return json(200, {
    ok: true,
    id: row.id,
    actionable: fixActionable,
    scope: triage.scope,
    confidence: triage.confidence,
    cost_usd: costUsd,
    usage,
  });
});
