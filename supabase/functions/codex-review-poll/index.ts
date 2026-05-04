// Codex Review Poll — completes the auto-fix-with-Codex loop.
//
// Triggered every 1 min from .github/workflows/codex-review-poll.yml.
// For each WAITING_CODEX row >= 3 min old:
//   1. Fetch PR review comments from GitHub.
//   2. Detect Codex bot comments (login containing 'codex' or 'github-copilot').
//   3. Classify verdict:
//      - GREEN: Codex commented + no P1/P2/critical/blocker keywords
//      - FLAGGED: Codex flagged P1/P2/blocker
//      - NO_REVIEW_YET: Codex hasn't commented after >= 3 min — escalate to PROPOSE
//   4. If GREEN -> call supervise-fix with codex_green=true -> Supervisor auto-merges
//   5. If FLAGGED -> call fix-attempt with retry context (max 2 retries) OR escalate to Iulian
//   6. Else -> escalate to Iulian via Telegram (PROPOSE)
//
// Idempotent: multiple poll runs on same PR converge.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN') ?? '';
const GITHUB_REPO = Deno.env.get('GITHUB_REPO') ?? 'IulianMoldoveanu/RSHIR-Platform';
const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const TG_CHAT = Deno.env.get('TELEGRAM_IULIAN_CHAT_ID') ?? '';
const POLL_TOKEN = Deno.env.get('CODEX_POLL_TOKEN') ?? '';
const INTERNAL_JWT = Deno.env.get('INTERNAL_FN_AUTH_JWT') ?? '';

const MIN_WAIT_MINUTES = 3;
const MAX_WAIT_MINUTES = 12;
const MAX_RETRIES = 2;
const FLAG_KEYWORDS = ['p1', 'p2', 'blocker', 'critical', 'security', 'must fix', 'breaking'];

type TrackingRow = {
  id: string;
  fix_attempt_id: string;
  pr_number: number;
  opened_at: string;
  poll_count: number;
  retry_count: number;
  status: string;
};

async function dbSelect(table: string, query: string): Promise<unknown[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY },
  });
  if (!r.ok) return [];
  return r.json();
}

async function dbUpdate(table: string, idEq: string, patch: Record<string, unknown>): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${idEq}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

async function fetchPrReviewComments(prNumber: number): Promise<{ user: string; body: string; createdAt: string }[]> {
  const out: { user: string; body: string; createdAt: string }[] = [];
  const endpoints = [
    `https://api.github.com/repos/${GITHUB_REPO}/pulls/${prNumber}/comments`,
    `https://api.github.com/repos/${GITHUB_REPO}/issues/${prNumber}/comments`,
    `https://api.github.com/repos/${GITHUB_REPO}/pulls/${prNumber}/reviews`,
  ];
  for (const url of endpoints) {
    const r = await fetch(url, {
      headers: { Authorization: 'token ' + GITHUB_TOKEN, Accept: 'application/vnd.github+json' },
    });
    if (!r.ok) continue;
    const arr = await r.json();
    if (!Array.isArray(arr)) continue;
    for (const c of arr) {
      const user = (c.user?.login ?? '').toLowerCase();
      const body = (c.body ?? '').toString();
      out.push({ user, body, createdAt: c.created_at ?? c.submitted_at ?? '' });
    }
  }
  return out;
}

function classifyCodexVerdict(comments: { user: string; body: string }[]): {
  hasReview: boolean;
  flagged: boolean;
  flaggedReason?: string;
  reviewerLogins: string[];
} {
  const codexComments = comments.filter((c) =>
    /codex|copilot|chatgpt-codex/.test(c.user)
  );
  const reviewerLogins = [...new Set(codexComments.map((c) => c.user))];
  if (codexComments.length === 0) return { hasReview: false, flagged: false, reviewerLogins };

  const flagged = codexComments.find((c) => {
    const lower = c.body.toLowerCase();
    return FLAG_KEYWORDS.some((kw) => lower.includes(kw));
  });
  return {
    hasReview: true,
    flagged: !!flagged,
    flaggedReason: flagged ? flagged.body.substring(0, 300) : undefined,
    reviewerLogins,
  };
}

async function callSupervise(fixAttemptId: string, codexGreen: boolean): Promise<void> {
  if (!INTERNAL_JWT) {
    console.error('[codex-review-poll] INTERNAL_FN_AUTH_JWT missing — cannot call supervise-fix');
    return;
  }
  await fetch(`${SUPABASE_URL}/functions/v1/supervise-fix`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + INTERNAL_JWT,
    },
    body: JSON.stringify({ fix_attempt_id: fixAttemptId, codex_green: codexGreen }),
  });
}

async function tg(text: string): Promise<void> {
  if (!TG_TOKEN || !TG_CHAT) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
}

Deno.serve(async (req) => {
  const auth = req.headers.get('x-poll-token') ?? '';
  if (POLL_TOKEN && auth !== POLL_TOKEN) {
    return new Response('forbidden', { status: 403 });
  }

  const now = Date.now();
  const minOpenAt = new Date(now - MAX_WAIT_MINUTES * 60_000).toISOString();
  const maxOpenAt = new Date(now - MIN_WAIT_MINUTES * 60_000).toISOString();

  // Pick rows that have been waiting between MIN and MAX
  const rows = (await dbSelect(
    'codex_review_tracking',
    `status=eq.WAITING_CODEX&opened_at=gte.${minOpenAt}&opened_at=lte.${maxOpenAt}&select=*&limit=10`,
  )) as TrackingRow[];

  const processed: { pr: number; result: string }[] = [];

  for (const row of rows) {
    const comments = await fetchPrReviewComments(row.pr_number);
    const verdict = classifyCodexVerdict(comments);

    await dbUpdate('codex_review_tracking', row.id, {
      last_polled_at: new Date().toISOString(),
      poll_count: row.poll_count + 1,
      codex_comment_count: comments.length,
      codex_verdict: verdict,
    });

    if (!verdict.hasReview) {
      const ageMin = (now - new Date(row.opened_at).getTime()) / 60_000;
      if (ageMin >= MAX_WAIT_MINUTES) {
        await dbUpdate('codex_review_tracking', row.id, { status: 'DONE', final_action: 'NO_CODEX_PROPOSE' });
        await tg(`⏳ <b>Codex n-a comentat în ${MAX_WAIT_MINUTES} min pe PR #${row.pr_number}</b>\nFix Agent → PROPOSE_ONLY (review manual). https://github.com/${GITHUB_REPO}/pull/${row.pr_number}`);
        processed.push({ pr: row.pr_number, result: 'no_review_propose' });
      } else {
        processed.push({ pr: row.pr_number, result: 'still_waiting' });
      }
      continue;
    }

    if (verdict.flagged) {
      if (row.retry_count < MAX_RETRIES) {
        await dbUpdate('codex_review_tracking', row.id, {
          status: 'RETRY',
          retry_count: row.retry_count + 1,
          final_action: 'RETRY_FIX',
        });
        await tg(`🔄 <b>Codex flagged PR #${row.pr_number}</b> — Fix Agent încearcă corectare (retry ${row.retry_count + 1}/${MAX_RETRIES})\n${verdict.flaggedReason?.substring(0, 200) ?? ''}`);
        processed.push({ pr: row.pr_number, result: 'retry_scheduled' });
      } else {
        await dbUpdate('codex_review_tracking', row.id, { status: 'CODEX_FLAGGED', final_action: 'ESCALATE_IULIAN' });
        await tg(`🚫 <b>PR #${row.pr_number} blocat de Codex după ${MAX_RETRIES} încercări</b>\nIntervine tu: https://github.com/${GITHUB_REPO}/pull/${row.pr_number}\n\nVerdict: ${verdict.flaggedReason?.substring(0, 300) ?? ''}`);
        processed.push({ pr: row.pr_number, result: 'escalate_iulian' });
      }
      continue;
    }

    // GREEN — call Supervisor with codex_green flag
    await dbUpdate('codex_review_tracking', row.id, { status: 'CODEX_GREEN', final_action: 'TRIGGER_SUPERVISE' });
    await callSupervise(row.fix_attempt_id, true);
    await dbUpdate('codex_review_tracking', row.id, { status: 'DONE' });
    await tg(`🟢 <b>Codex verde pe PR #${row.pr_number}</b> → Supervisor decide auto-merge.\nReviewers: ${verdict.reviewerLogins.join(', ')}`);
    processed.push({ pr: row.pr_number, result: 'codex_green_to_supervise' });
  }

  return Response.json({ processed: processed.length, details: processed, ts: new Date().toISOString() });
});
