// HIR Restaurant Suite — Supervisor Agent (Phase 4)
//
// POST /supervise-fix
//   Body: { fix_attempt_id: uuid }
//
// Pipeline:
//   1. Load fix_attempt + feedback (NOT the Fix Agent's reasoning).
//   2. Pull diff from GitHub PR.
//   3. Send Claude Sonnet 4.5 with a SUPERVISOR system prompt + diff + feedback.
//   4. Parse 12 guardrails verdict + risk score.
//   5. Combine with agent_trust_calibration to AUTO_MERGE / PROPOSE / REJECT.
//   6. Apply decision: merge via gh API, or notify Iulian, or close PR.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN')!;
const GITHUB_REPO = Deno.env.get('GITHUB_REPO') ?? 'IulianMoldoveanu/RSHIR-Platform';
const TELEGRAM_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_IULIAN_CHAT_ID') ?? '';

const MODEL = 'claude-sonnet-4-5-20250929';

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { 'content-type': 'application/json' },
  });

interface FixAttemptRow {
  id: string;
  feedback_id: string;
  branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  diff_lines_added: number;
  diff_lines_removed: number;
  files_touched: string[];
  commit_message: string | null;
  status: string;
}

interface FeedbackRow {
  id: string;
  category: string;
  severity: string | null;
  description: string;
  triage_category: string | null;
  url: string | null;
  tenant_id: string | null;
  reporter_user_id: string | null;
}

interface SupervisorVerdict {
  score: number;
  decision: 'AUTO_MERGE' | 'PROPOSE' | 'REJECT';
  reasoning: string;
  guardrails_passed: string[];
  guardrails_failed: string[];
  raw: unknown;
  cost: number;
}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function getDiff(prNumber: number): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/pulls/${prNumber}`, {
    headers: {
      Accept: 'application/vnd.github.v3.diff',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`getDiff ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.text();
}

async function getCheckRuns(prNumber: number): Promise<{ allGreen: boolean; raw: unknown }> {
  const prRes = await gh(`/repos/${GITHUB_REPO}/pulls/${prNumber}`);
  if (!prRes.ok) return { allGreen: false, raw: { error: prRes.status } };
  const pr = await prRes.json();
  const sha = pr.head?.sha;
  if (!sha) return { allGreen: false, raw: { error: 'no head sha' } };
  const checksRes = await gh(`/repos/${GITHUB_REPO}/commits/${sha}/check-runs`);
  if (!checksRes.ok) return { allGreen: false, raw: { error: checksRes.status } };
  const checks = await checksRes.json();
  const runs = checks.check_runs ?? [];
  if (runs.length === 0) return { allGreen: false, raw: { reason: 'no check runs yet' } };
  const allDone = runs.every((r: { status: string }) => r.status === 'completed');
  if (!allDone) return { allGreen: false, raw: { reason: 'still running' } };
  const allGreen = runs.every(
    (r: { conclusion: string }) =>
      r.conclusion === 'success' || r.conclusion === 'neutral' || r.conclusion === 'skipped',
  );
  return { allGreen, raw: runs };
}

async function markPRReadyForReview(prNumber: number): Promise<void> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){id}}}`,
      variables: { owner: GITHUB_REPO.split('/')[0], name: GITHUB_REPO.split('/')[1], number: prNumber },
    }),
  });
  if (!res.ok) return;
  const j = await res.json();
  const id = j?.data?.repository?.pullRequest?.id;
  if (!id) return;
  await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id}}}`,
      variables: { id },
    }),
  });
}

async function mergePR(prNumber: number, commitTitle: string): Promise<{ ok: boolean; detail: unknown }> {
  await markPRReadyForReview(prNumber);
  const res = await gh(`/repos/${GITHUB_REPO}/pulls/${prNumber}/merge`, {
    method: 'PUT',
    body: JSON.stringify({
      commit_title: commitTitle,
      merge_method: 'squash',
    }),
  });
  const detail = await res.json().catch(() => null);
  return { ok: res.ok, detail };
}

async function deleteBranch(branch: string): Promise<void> {
  await gh(`/repos/${GITHUB_REPO}/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'DELETE' });
}

async function closePR(prNumber: number, comment: string): Promise<void> {
  await gh(`/repos/${GITHUB_REPO}/issues/${prNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: comment }),
  });
  await gh(`/repos/${GITHUB_REPO}/pulls/${prNumber}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed' }),
  });
}

async function commentPR(prNumber: number, body: string): Promise<void> {
  await gh(`/repos/${GITHUB_REPO}/issues/${prNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

async function tg(text: string): Promise<void> {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  }).catch(() => {});
}

async function callSupervisor(
  feedback: FeedbackRow,
  diff: string,
  ciGreen: boolean,
): Promise<SupervisorVerdict> {
  const systemPrompt = [
    'You are the Supervisor Agent for the HIR Restaurant Suite auto-fix loop.',
    '',
    'You receive a vendor feedback report + a unified diff produced by another AI Fix Agent. You DO NOT see the Fix Agent reasoning. Your job is independent review against 12 hard guardrails.',
    '',
    'TWELVE GUARDRAILS (verify each, list which passed and which failed):',
    '1. diff-scope-matches-fix-category — diff aligns with the triage category (no scope creep)',
    '2. no-deny-path — no edits in supabase/migrations, apps/restaurant-courier, .env, secrets, middleware.ts, auth/, payment Edge Functions (courier-mirror-pharma, courier-push-dispatch, notify-customer-status), package.json, pnpm-lock.yaml',
    '3. diff-size-within-limits — at most 3 files, 50 added lines, 30 removed lines, 8 KB',
    '4. no-secrets-committed — no API keys, JWTs, tokens, or env-style secrets in the diff',
    '5. no-new-dependency — no package.json or lock file edits',
    '6. no-leftover-console-log — no console.log( added in app code (test files OK)',
    '7. no-todo-fixme-added — no TODO, FIXME, or XXX comments introduced',
    '8. no-unjustified-any — no new `: any`, `as any`, or `<any>` without an inline justification comment',
    '9. no-audit-log-removal — no removal of writes to audit_log or copilot_agent_runs',
    '10. no-rls-policy-removal — no removal/weakening of RLS policies, even adjacent in the file',
    '11. no-public-surface-widening — no new export of internal helpers, no opening of internal-only routes',
    '12. ci-green — CI typecheck + lint + tests passed (provided to you below)',
    '',
    'Output STRICT JSON, no prose outside it:',
    '{',
    '  "score": <integer 0..100>,',
    '  "decision": "AUTO_MERGE" | "PROPOSE" | "REJECT",',
    '  "reasoning": "<one short paragraph>",',
    '  "guardrails_passed": ["1","2",...],',
    '  "guardrails_failed": ["..."]',
    '}',
    '',
    'Scoring rubric:',
    '- 90-100: every guardrail passes, fix is obviously correct, scope matches.',
    '- 70-89: every guardrail passes but reviewer has minor concerns.',
    '- 60-69: 1-2 minor guardrails fail OR moderate concern.',
    '- below 60: any of guardrails 2/3/4/5/9/10 fails OR fix is wrong.',
    '',
    'Decision rule:',
    '- score >= 80 AND no failed guardrails -> AUTO_MERGE',
    '- score 60-89 OR minor failures -> PROPOSE',
    '- score < 60 OR major failure (deny-path, secret, schema, RLS, audit-log) -> REJECT',
    '',
    'Be skeptical. Default to PROPOSE when in doubt.',
  ].join('\n');

  const userText = [
    `Feedback id:    ${feedback.id}`,
    `Category:       ${feedback.category} (triage: ${feedback.triage_category ?? 'unknown'})`,
    `Severity:       ${feedback.severity ?? 'unknown'}`,
    `URL:            ${feedback.url ?? '(none)'}`,
    `CI green:       ${ciGreen ? 'YES' : 'NO'}`,
    '',
    'Description:',
    feedback.description,
    '',
    'Diff:',
    '```diff',
    diff.length > 12000 ? diff.slice(0, 12000) + '\n[truncated]' : diff,
    '```',
  ].join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const j = await res.json();
  const text =
    (j.content ?? [])
      .filter((c: { type: string }) => c.type === 'text')
      .map((c: { text: string }) => c.text)
      .join('\n')
      .trim() ?? '';

  const u = j.usage ?? {};
  const inputTok = (u.input_tokens ?? 0) - (u.cache_read_input_tokens ?? 0);
  const cachedTok = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const outTok = u.output_tokens ?? 0;
  const cost =
    (inputTok / 1_000_000) * 5 +
    (cachedTok / 1_000_000) * 0.5 +
    (cacheWrite / 1_000_000) * 6.25 +
    (outTok / 1_000_000) * 25;

  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Supervisor output missing JSON');
  const parsed = JSON.parse(m[0]);
  const score = Math.max(0, Math.min(100, parseInt(String(parsed.score ?? 0), 10)));
  const decision = (parsed.decision ?? 'PROPOSE') as SupervisorVerdict['decision'];
  return {
    score,
    decision,
    reasoning: String(parsed.reasoning ?? '').slice(0, 1500),
    guardrails_passed: Array.isArray(parsed.guardrails_passed) ? parsed.guardrails_passed.map(String) : [],
    guardrails_failed: Array.isArray(parsed.guardrails_failed) ? parsed.guardrails_failed.map(String) : [],
    raw: j,
    cost,
  };
}

type TrustLevel = 'OFF' | 'PROPOSE_ONLY' | 'AUTO_REVERSIBLE' | 'AUTO_FULL';

function combineDecision(
  verdict: SupervisorVerdict,
  trust: TrustLevel,
  triageScope: string | null,
  codexGreen: boolean,
): SupervisorVerdict['decision'] {
  const major = ['2', '3', '4', '5', '9', '10'];
  const blocking = verdict.guardrails_failed.some((g) => major.some((m) => g.startsWith(m)));
  // Blocking guardrails are NEVER overridden — Codex is a peer reviewer, not
  // a security overrider. Same path as before regardless of codexGreen.
  if (blocking) return verdict.score < 60 ? 'REJECT' : 'PROPOSE';

  if (verdict.decision === 'REJECT' || verdict.score < 60) return 'REJECT';

  // RSHIR-A11: Codex green review promotes PROPOSE → AUTO_MERGE when
  // Supervisor score is high enough (>=70) AND no failed guardrails AND
  // the trust level isn't OFF. Bypasses the conservative trust ladder
  // (PROPOSE_ONLY → AUTO_REVERSIBLE → AUTO_FULL) because we have an
  // independent reviewer signing off.
  if (
    codexGreen &&
    trust !== 'OFF' &&
    verdict.score >= 70 &&
    verdict.guardrails_failed.length === 0
  ) {
    return 'AUTO_MERGE';
  }

  if (trust === 'OFF' || trust === 'PROPOSE_ONLY') return 'PROPOSE';

  if (trust === 'AUTO_FULL' && verdict.score >= 90 && verdict.guardrails_failed.length === 0) {
    return 'AUTO_MERGE';
  }
  const safeScopes = ['ui-text', 'a11y', 'copy', 'error-message', 'loading-state'];
  if (
    trust === 'AUTO_REVERSIBLE' &&
    verdict.score >= 80 &&
    verdict.guardrails_failed.length === 0 &&
    triageScope &&
    safeScopes.includes(triageScope)
  ) {
    return 'AUTO_MERGE';
  }
  return 'PROPOSE';
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const body = await req.json().catch(() => ({}));
  const fixAttemptId = body?.fix_attempt_id;
  // RSHIR-A11: codex-review-poll passes codex_green=true after parsing
  // Codex bot review comments and finding no P1/P2/blocker keywords.
  const codexGreen = body?.codex_green === true;
  if (!fixAttemptId) return json(400, { error: 'fix_attempt_id required' });

  const supa: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const { data: fa, error: faErr } = await supa
    .from('fix_attempts')
    .select('*')
    .eq('id', fixAttemptId)
    .single();
  if (faErr || !fa) return json(404, { error: 'fix_attempt not found', detail: faErr });
  const attempt = fa as FixAttemptRow;
  if (attempt.status !== 'PROPOSED') return json(409, { error: `bad status ${attempt.status}` });
  if (!attempt.pr_number) return json(409, { error: 'no PR number' });

  const { data: fb, error: fbErr } = await supa
    .from('feedback_reports')
    .select('id, category, severity, description, triage_category, url, tenant_id, reporter_user_id')
    .eq('id', attempt.feedback_id)
    .single();
  if (fbErr || !fb) return json(404, { error: 'feedback not found', detail: fbErr });
  const feedback = fb as FeedbackRow;

  let diff = '';
  let ciGreen = false;
  let ciDetail: unknown = null;
  try {
    diff = await getDiff(attempt.pr_number);
    const ci = await getCheckRuns(attempt.pr_number);
    ciGreen = ci.allGreen;
    ciDetail = ci.raw;
  } catch (e) {
    return json(500, { error: 'github failed', detail: (e as Error).message });
  }

  let verdict: SupervisorVerdict;
  try {
    verdict = await callSupervisor(feedback, diff, ciGreen);
  } catch (e) {
    return json(500, { error: 'supervisor failed', detail: (e as Error).message });
  }

  if (!ciGreen && !verdict.guardrails_failed.includes('12')) {
    verdict.guardrails_failed.push('12');
    verdict.guardrails_passed = verdict.guardrails_passed.filter((g) => g !== '12');
    if (verdict.score > 70) verdict.score = 70;
  }

  const { data: trustRow } = await supa
    .from('agent_trust_calibration')
    .select('trust_level')
    .eq('agent_name', 'fix-attempt')
    .single();
  const trust: TrustLevel = (trustRow?.trust_level ?? 'PROPOSE_ONLY') as TrustLevel;

  const finalDecision = combineDecision(verdict, trust, feedback.triage_category, codexGreen);

  let merged = false;
  let mergeDetail: unknown = null;

  if (finalDecision === 'AUTO_MERGE') {
    const mr = await mergePR(attempt.pr_number, attempt.commit_message ?? 'auto-fix');
    merged = mr.ok;
    mergeDetail = mr.detail;
    if (merged && attempt.branch_name) {
      await deleteBranch(attempt.branch_name);
    }
    if (merged) {
      await commentPR(attempt.pr_number, `Auto-merged by Supervisor (score ${verdict.score}). Reasoning: ${verdict.reasoning}`);
    }
  } else if (finalDecision === 'REJECT') {
    await closePR(
      attempt.pr_number,
      `Supervisor REJECTED (score ${verdict.score}). Failed guardrails: ${verdict.guardrails_failed.join(', ') || 'none'}. Reasoning: ${verdict.reasoning}`,
    );
    if (attempt.branch_name) await deleteBranch(attempt.branch_name).catch(() => {});
  } else {
    await commentPR(
      attempt.pr_number,
      `Supervisor verdict: PROPOSE (score ${verdict.score}). Iulian: review + merge manually.\n\nFailed guardrails: ${verdict.guardrails_failed.join(', ') || 'none'}\n\nReasoning: ${verdict.reasoning}`,
    );
  }

  const newStatus =
    finalDecision === 'AUTO_MERGE' && merged
      ? 'MERGED'
      : finalDecision === 'REJECT'
        ? 'REJECTED'
        : 'SUPERVISED';

  await supa
    .from('fix_attempts')
    .update({
      status: newStatus,
      supervisor_score: verdict.score,
      supervisor_decision: finalDecision,
      supervisor_reasoning: verdict.reasoning,
      supervisor_guardrails_passed: verdict.guardrails_passed,
      supervisor_guardrails_failed: verdict.guardrails_failed,
      supervisor_response_raw: verdict.raw as Record<string, unknown>,
      supervisor_cost_usd: verdict.cost,
    })
    .eq('id', attempt.id);

  if (finalDecision === 'AUTO_MERGE' && merged) {
    await supa
      .from('feedback_reports')
      .update({
        status: 'FIX_AUTO_MERGED',
        supervisor_score: verdict.score,
        supervisor_decision: 'AUTO_MERGE',
        supervisor_reasoning: verdict.reasoning,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', attempt.feedback_id);
  } else if (finalDecision === 'REJECT') {
    await supa
      .from('feedback_reports')
      .update({
        status: 'HUMAN_FIX_NEEDED',
        supervisor_score: verdict.score,
        supervisor_decision: 'REJECT',
        supervisor_reasoning: verdict.reasoning,
      })
      .eq('id', attempt.feedback_id);
  } else {
    await supa
      .from('feedback_reports')
      .update({
        status: 'FIX_PROPOSED',
        supervisor_score: verdict.score,
        supervisor_decision: 'PROPOSE',
        supervisor_reasoning: verdict.reasoning,
      })
      .eq('id', attempt.feedback_id);
  }

  const summary =
    `<b>Supervisor verdict</b>: ${finalDecision} (score ${verdict.score})\n` +
    `Feedback: ${feedback.description.slice(0, 120)}\n` +
    `PR: ${attempt.pr_url}\n` +
    `Failed guardrails: ${verdict.guardrails_failed.join(', ') || 'none'}`;
  await tg(summary);

  return json(200, {
    ok: true,
    decision: finalDecision,
    score: verdict.score,
    merged,
    merge_detail: mergeDetail,
    ci_green: ciGreen,
    ci_detail: ciDetail,
    cost_usd: verdict.cost,
  });
}

Deno.serve((req) =>
  handle(req).catch((e) => json(500, { error: 'unhandled', message: (e as Error).message })),
);
