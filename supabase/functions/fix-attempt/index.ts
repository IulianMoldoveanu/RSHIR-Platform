// HIR Restaurant Suite — Fix Agent (Phase 3)
//
// POST /fix-attempt
//   Body: { feedback_id: uuid }
//
// Pipeline:
//   1. Load feedback + console excerpt + screenshot signed URL.
//   2. Retrieve top-K relevant code chunks (FTS or pgvector).
//   3. Send Claude Sonnet 4.5 with a cached system prompt + chunks.
//   4. Validate response (deny-paths, diff caps, no PUNT).
//   5. Create branch + commit via GitHub API + open DRAFT PR.
//   6. Insert fix_attempts row → trigger fires supervise-fix.
//
// Hard guardrails enforced both before sending to Claude (limit retrieved
// scope) AND after parsing the response (reject violations).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN')!;
const GITHUB_REPO = Deno.env.get('GITHUB_REPO') ?? 'IulianMoldoveanu/RSHIR-Platform';
const GITHUB_BASE_BRANCH = Deno.env.get('GITHUB_BASE_BRANCH') ?? 'main';

const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_FILES = 3;
const MAX_ADDED_LINES = 50;
const MAX_REMOVED_LINES = 30;
const MAX_DIFF_BYTES = 8000;

const DENY_PATTERNS: RegExp[] = [
  /^supabase\/migrations\//,
  /^apps\/restaurant-courier\//,
  /\.env(\.|$)/,
  /(^|\/)secrets/i,
  /middleware\.ts$/,
  /^auth\//,
  /^supabase\/functions\/(courier-mirror-pharma|courier-push-dispatch|notify-customer-status)\//,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /package\.json$/,
];

const ALLOWED_PATH_PREFIXES = [
  'apps/restaurant-admin/',
  'apps/restaurant-web/',
  'packages/ui/',
];

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { 'content-type': 'application/json' },
  });

interface FeedbackRow {
  id: string;
  tenant_id: string | null;
  category: string;
  severity: string | null;
  description: string;
  screenshot_path: string | null;
  url: string | null;
  user_agent: string | null;
  console_log_excerpt: string | null;
  triage_category: string | null;
  triage_reasoning: string | null;
  triage_routed_to_fix: boolean;
  status: string;
}

interface CodeChunk {
  file_path: string;
  chunk_index: number;
  chunk_text: string;
  app: string;
  score: number;
}

// -----------------------------------------------------------------------
// Anthropic
// -----------------------------------------------------------------------
async function callClaudeFix(
  feedback: FeedbackRow,
  chunks: CodeChunk[],
  signedScreenshotUrl: string | null,
): Promise<{
  branch: string;
  commit: string;
  diff: string;
  punted: boolean;
  raw: unknown;
  cost: number;
}> {
  const systemPrompt = [
    'You are the Fix Agent for the HIR Restaurant Suite.',
    '',
    'You receive: a vendor feedback report + relevant code context. Output ONE unified diff that resolves the issue, scoped to the allowed fix categories the Triage Agent classified.',
    '',
    'Hard rules:',
    `1. Touch ≤${MAX_FILES} files, add ≤${MAX_ADDED_LINES} lines, remove ≤${MAX_REMOVED_LINES} lines.`,
    '2. Never touch: schema migrations, auth, RLS policies, the courier app (apps/restaurant-courier/), payment Edge Functions (courier-mirror-pharma, courier-push-dispatch, notify-customer-status), env files, middleware.ts, package.json, pnpm-lock.yaml.',
    '3. Match existing style. No "improvements" beyond what the bug requires.',
    '4. No new dependencies (no package.json edits).',
    '5. No new comments unless the WHY is non-obvious. No emojis. No console.log left in app code.',
    '6. Allowed path prefixes only: ' + ALLOWED_PATH_PREFIXES.join(', '),
    '7. Output format EXACTLY (use the markers, nothing else):',
    '<branch>auto-fix/feedback-<short-id>-<slug></branch>',
    '<commit>fix(<scope>): <one-line summary></commit>',
    '<diff>',
    '--- a/path/to/file.tsx',
    '+++ b/path/to/file.tsx',
    '@@ ...',
    '</diff>',
    '',
    'If you cannot fix it within the rules, output exactly: PUNT',
    '',
    'CONTEXT: HIR is a restaurant SaaS in Romanian. Vendor-facing copy is formal RO ("dumneavoastră"). Stack is Next.js 14 App Router + Supabase + TypeScript + Tailwind. Match shadcn/zinc-palette UI conventions.',
  ].join('\n');

  const chunkBlock = chunks
    .map(
      (c, i) =>
        `### chunk ${i + 1} — ${c.file_path} (chunk ${c.chunk_index}, app=${c.app})\n` +
        '```\n' +
        c.chunk_text +
        '\n```',
    )
    .join('\n\n');

  const userParts: unknown[] = [
    {
      type: 'text',
      text: [
        `Feedback id: ${feedback.id}`,
        `Tenant id:   ${feedback.tenant_id ?? '(none)'}`,
        `Category:    ${feedback.category} (triage said: ${feedback.triage_category ?? 'unknown'})`,
        `Severity:    ${feedback.severity ?? 'unknown'}`,
        `URL:         ${feedback.url ?? '(none)'}`,
        `User-agent:  ${feedback.user_agent ?? '(none)'}`,
        '',
        `Description:\n${feedback.description}`,
        '',
        `Triage reasoning: ${feedback.triage_reasoning ?? '(none)'}`,
        '',
        `Console excerpt (last lines):\n${feedback.console_log_excerpt ?? '(none)'}`,
        '',
        `Relevant code chunks (top ${chunks.length}):`,
        '',
        chunkBlock,
      ].join('\n'),
    },
  ];
  if (signedScreenshotUrl) {
    userParts.push({
      type: 'text',
      text: `Screenshot (24h signed URL, view-only): ${signedScreenshotUrl}`,
    });
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userParts }],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 500)}`);
  }
  const j = await res.json();
  const text =
    (j.content ?? [])
      .filter((c: { type: string }) => c.type === 'text')
      .map((c: { text: string }) => c.text)
      .join('\n')
      .trim() ?? '';

  // Cost — Sonnet 4.5: $5/1M input, $25/1M output, cached input $0.50/1M
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

  if (text.trim() === 'PUNT' || /\bPUNT\b/.test(text.split('\n')[0] ?? '')) {
    return { branch: '', commit: '', diff: '', punted: true, raw: j, cost };
  }

  const branchMatch = text.match(/<branch>([\s\S]*?)<\/branch>/);
  const commitMatch = text.match(/<commit>([\s\S]*?)<\/commit>/);
  const diffMatch = text.match(/<diff>([\s\S]*?)<\/diff>/);

  if (!branchMatch || !commitMatch || !diffMatch) {
    throw new Error('Fix Agent output malformed (missing markers).');
  }

  return {
    branch: branchMatch[1].trim(),
    commit: commitMatch[1].trim(),
    diff: diffMatch[1].trim(),
    punted: false,
    raw: j,
    cost,
  };
}

// -----------------------------------------------------------------------
// Diff parsing + guardrail validation
// -----------------------------------------------------------------------
interface ParsedFile {
  path: string;
  added: number;
  removed: number;
  newContent: string | null;       // full new file content (we apply by writing the whole file)
  hunks: { start: number; lines: string[] }[];
}

interface ValidationResult {
  ok: boolean;
  reason?: string;
  files: ParsedFile[];
  totalAdded: number;
  totalRemoved: number;
}

function parseDiff(diff: string): ParsedFile[] {
  // Minimal unified-diff parser. We only need the file list + +/- counts,
  // and we apply by re-fetching the file from GitHub and applying the hunks
  // textually.
  const files: ParsedFile[] = [];
  const lines = diff.split('\n');
  let cur: ParsedFile | null = null;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.startsWith('+++ b/')) {
      const path = ln.slice('+++ b/'.length).trim();
      cur = { path, added: 0, removed: 0, newContent: null, hunks: [] };
      files.push(cur);
    } else if (ln.startsWith('--- a/')) {
      // ignore
    } else if (cur && ln.startsWith('@@')) {
      const m = ln.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      const start = m ? parseInt(m[2], 10) : 0;
      cur.hunks.push({ start, lines: [] });
    } else if (cur && cur.hunks.length > 0) {
      const lastHunk = cur.hunks[cur.hunks.length - 1];
      lastHunk.lines.push(ln);
      if (ln.startsWith('+') && !ln.startsWith('+++')) cur.added++;
      else if (ln.startsWith('-') && !ln.startsWith('---')) cur.removed++;
    }
  }
  return files;
}

function violatesDeny(path: string): boolean {
  for (const re of DENY_PATTERNS) if (re.test(path)) return true;
  if (!ALLOWED_PATH_PREFIXES.some((p) => path.startsWith(p))) return true;
  return false;
}

function validateDiff(diff: string): ValidationResult {
  if (diff.length > MAX_DIFF_BYTES) {
    return { ok: false, reason: `diff too big (${diff.length} > ${MAX_DIFF_BYTES} bytes)`, files: [], totalAdded: 0, totalRemoved: 0 };
  }
  const files = parseDiff(diff);
  if (files.length === 0) return { ok: false, reason: 'no files in diff', files, totalAdded: 0, totalRemoved: 0 };
  if (files.length > MAX_FILES) return { ok: false, reason: `too many files (${files.length} > ${MAX_FILES})`, files, totalAdded: 0, totalRemoved: 0 };
  let added = 0, removed = 0;
  for (const f of files) {
    if (violatesDeny(f.path)) return { ok: false, reason: `deny-path: ${f.path}`, files, totalAdded: 0, totalRemoved: 0 };
    added += f.added;
    removed += f.removed;
  }
  if (added > MAX_ADDED_LINES) return { ok: false, reason: `too many added lines (${added} > ${MAX_ADDED_LINES})`, files, totalAdded: added, totalRemoved: removed };
  if (removed > MAX_REMOVED_LINES) return { ok: false, reason: `too many removed lines (${removed} > ${MAX_REMOVED_LINES})`, files, totalAdded: added, totalRemoved: removed };
  return { ok: true, files, totalAdded: added, totalRemoved: removed };
}

// -----------------------------------------------------------------------
// GitHub API — apply diff via Contents API on a new branch + open draft PR
// -----------------------------------------------------------------------
async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  return res;
}

async function getBaseSha(): Promise<string> {
  const res = await gh(`/repos/${GITHUB_REPO}/git/ref/heads/${GITHUB_BASE_BRANCH}`);
  if (!res.ok) throw new Error(`getBaseSha ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.object.sha;
}

async function createBranch(branch: string, sha: string) {
  const res = await gh(`/repos/${GITHUB_REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
  if (!res.ok && res.status !== 422) {
    throw new Error(`createBranch ${res.status}: ${await res.text()}`);
  }
}

async function getFile(path: string, ref: string): Promise<{ content: string; sha: string } | null> {
  const res = await gh(`/repos/${GITHUB_REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${ref}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getFile ${res.status}: ${await res.text()}`);
  const j = await res.json();
  if (Array.isArray(j)) throw new Error('getFile: path is a directory');
  // Decode base64 → bytes → UTF-8 string (atob alone produces Latin-1 mojibake).
  const b64 = (j.content ?? '').replace(/\n/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const decoded = new TextDecoder('utf-8').decode(bytes);
  return { content: decoded, sha: j.sha };
}

function applyHunks(orig: string, hunks: { start: number; lines: string[] }[]): string | null {
  // Apply each hunk by replacing the contiguous run starting at hunk.start
  // with its '+' / ' ' lines. Returns null on mismatch.
  const origLines = orig.split('\n');
  // Apply hunks in reverse so earlier offsets stay valid.
  const sorted = [...hunks].sort((a, b) => b.start - a.start);
  let out = origLines.slice();
  for (const h of sorted) {
    const ctxAndMinus: string[] = [];
    const finalBlock: string[] = [];
    for (const ln of h.lines) {
      if (ln.startsWith('+')) finalBlock.push(ln.slice(1));
      else if (ln.startsWith('-')) ctxAndMinus.push(ln.slice(1));
      else if (ln.startsWith(' ')) {
        ctxAndMinus.push(ln.slice(1));
        finalBlock.push(ln.slice(1));
      }
      // ignore '\ No newline at end of file'
    }
    // Splice in.
    const start = Math.max(0, h.start - 1);
    // Verify the original block matches ctxAndMinus.
    const slice = out.slice(start, start + ctxAndMinus.length);
    if (slice.length !== ctxAndMinus.length || slice.join('\n') !== ctxAndMinus.join('\n')) {
      // Try a small wiggle window of ±5 lines.
      let matched = -1;
      for (let off = -5; off <= 5; off++) {
        const s = start + off;
        if (s < 0) continue;
        const candidate = out.slice(s, s + ctxAndMinus.length);
        if (candidate.length === ctxAndMinus.length && candidate.join('\n') === ctxAndMinus.join('\n')) {
          matched = s;
          break;
        }
      }
      if (matched < 0) return null;
      out = [...out.slice(0, matched), ...finalBlock, ...out.slice(matched + ctxAndMinus.length)];
    } else {
      out = [...out.slice(0, start), ...finalBlock, ...out.slice(start + ctxAndMinus.length)];
    }
  }
  return out.join('\n');
}

async function putFile(path: string, branch: string, content: string, sha: string | null, message: string) {
  // Encode UTF-8 string → bytes → base64 (avoid btoa(unescape) deprecation
  // edge cases on non-Latin-1 chars).
  const bytes = new TextEncoder().encode(content);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  const body: Record<string, unknown> = {
    message,
    content: b64,
    branch,
  };
  if (sha) body.sha = sha;
  const res = await gh(`/repos/${GITHUB_REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`putFile ${res.status}: ${await res.text()}`);
}

async function openDraftPR(branch: string, title: string, body: string): Promise<{ number: number; url: string }> {
  const res = await gh(`/repos/${GITHUB_REPO}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      head: branch,
      base: GITHUB_BASE_BRANCH,
      body,
      draft: true,
    }),
  });
  if (!res.ok) throw new Error(`openDraftPR ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return { number: j.number, url: j.html_url };
}

// -----------------------------------------------------------------------
// Main handler
// -----------------------------------------------------------------------
async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method' });

  const body = await req.json().catch(() => ({}));
  const feedbackId = body?.feedback_id;
  if (!feedbackId) return json(400, { error: 'feedback_id required' });

  const supa: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // 1. Load feedback.
  const { data: fb, error: fbErr } = await supa
    .from('feedback_reports')
    .select('*')
    .eq('id', feedbackId)
    .single();
  if (fbErr || !fb) return json(404, { error: 'feedback not found', detail: fbErr });
  const feedback = fb as FeedbackRow;
  if (!feedback.triage_routed_to_fix) return json(409, { error: 'not routed to fix' });
  if (feedback.status !== 'TRIAGED') return json(409, { error: `bad status ${feedback.status}` });

  // 2. Idempotency: skip if a fix_attempt already exists.
  const { count: existing } = await supa
    .from('fix_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('feedback_id', feedbackId);
  if ((existing ?? 0) > 0) {
    return json(200, { ok: true, skipped: 'already attempted' });
  }

  // 3. Top-K code chunks.
  const queryText = `${feedback.description}\n${feedback.url ?? ''}\n${(feedback.console_log_excerpt ?? '').slice(0, 500)}`;
  const { data: chunkRows, error: chunkErr } = await supa.rpc('search_code_chunks', {
    p_query_embedding: null,
    p_query_text: queryText,
    p_app_filter: null,
    p_limit: 5,
  });
  if (chunkErr) return json(500, { error: 'search_code_chunks failed', detail: chunkErr });
  const chunks = (chunkRows ?? []) as CodeChunk[];

  // 3b. Path hint: if the feedback mentions an explicit allowed source path,
  //     fetch that file's full content from GitHub HEAD and prepend it as a
  //     synthetic top-priority chunk. Improves fix accuracy when retrieval
  //     misses (FTS fallback case).
  const pathRegex = /(apps\/restaurant-(?:admin|web)\/[A-Za-z0-9_./-]+\.tsx?|packages\/(?:ui|delivery-client)\/[A-Za-z0-9_./-]+\.tsx?)/g;
  const mentionedPaths = Array.from(
    new Set((feedback.description.match(pathRegex) ?? []).slice(0, 2)),
  );
  for (const p of mentionedPaths) {
    try {
      const f = await getFile(p, GITHUB_BASE_BRANCH);
      if (f && f.content.length < 30_000) {
        chunks.unshift({
          file_path: p,
          chunk_index: 0,
          chunk_text: f.content,
          app: p.startsWith('apps/restaurant-admin/') ? 'restaurant-admin'
             : p.startsWith('apps/restaurant-web/')   ? 'restaurant-web'
             : 'shared',
          score: 1,
        });
      }
    } catch (_) { /* tolerate fetch failure */ }
  }

  // 4. Optional screenshot signed URL.
  let signed: string | null = null;
  if (feedback.screenshot_path) {
    const { data: signedData } = await supa.storage
      .from('tenant-feedback-screenshots')
      .createSignedUrl(feedback.screenshot_path, 60 * 60 * 24);
    signed = signedData?.signedUrl ?? null;
  }

  // 5. Call Claude Sonnet 4.5.
  let result: Awaited<ReturnType<typeof callClaudeFix>>;
  try {
    result = await callClaudeFix(feedback, chunks, signed);
  } catch (e) {
    await supa.from('fix_attempts').insert({
      feedback_id: feedbackId,
      status: 'FAILED',
      rejection_reason: `Anthropic call failed: ${(e as Error).message}`,
    });
    await supa.from('feedback_reports').update({ status: 'HUMAN_FIX_NEEDED' }).eq('id', feedbackId);
    return json(500, { error: 'anthropic failed', detail: (e as Error).message });
  }

  if (result.punted) {
    await supa.from('fix_attempts').insert({
      feedback_id: feedbackId,
      status: 'REJECTED',
      rejection_reason: 'Fix Agent PUNTed',
      agent_response_raw: result.raw,
      cost_usd: result.cost,
    });
    await supa.from('feedback_reports').update({ status: 'HUMAN_FIX_NEEDED' }).eq('id', feedbackId);
    return json(200, { ok: true, punted: true });
  }

  // 6. Validate diff.
  const v = validateDiff(result.diff);
  if (!v.ok) {
    await supa.from('fix_attempts').insert({
      feedback_id: feedbackId,
      status: 'REJECTED',
      rejection_reason: `guardrail violation: ${v.reason}`,
      agent_response_raw: result.raw,
      cost_usd: result.cost,
      branch_name: result.branch,
      commit_message: result.commit,
      diff_lines_added: v.totalAdded,
      diff_lines_removed: v.totalRemoved,
      files_touched: v.files.map((f) => f.path),
    });
    await supa.from('feedback_reports').update({ status: 'HUMAN_FIX_NEEDED' }).eq('id', feedbackId);
    return json(200, { ok: true, rejected: v.reason });
  }

  // 7. Apply diff via GitHub API.
  let prNumber: number | null = null;
  let prUrl: string | null = null;
  let applyError: string | null = null;
  try {
    const baseSha = await getBaseSha();
    const branch = result.branch || `auto-fix/feedback-${feedbackId.slice(0, 8)}`;
    await createBranch(branch, baseSha);

    for (const f of v.files) {
      const existing = await getFile(f.path, branch);
      const orig = existing?.content ?? '';
      let newContent = applyHunks(orig, f.hunks);
      if (newContent === null) {
        // Fallback: simple line-substitution from "-" / "+" pairs.
        const subs: { from: string; to: string }[] = [];
        for (const h of f.hunks) {
          const minus: string[] = [];
          const plus: string[] = [];
          for (const ln of h.lines) {
            if (ln.startsWith('-') && !ln.startsWith('---')) minus.push(ln.slice(1));
            else if (ln.startsWith('+') && !ln.startsWith('+++')) plus.push(ln.slice(1));
          }
          if (minus.length === plus.length) {
            for (let i = 0; i < minus.length; i++) subs.push({ from: minus[i], to: plus[i] });
          }
        }
        let candidate = orig;
        let appliedAll = subs.length > 0;
        for (const s of subs) {
          // Trim leading whitespace mismatch — match the trimmed substring.
          const fromTrim = s.from.trim();
          const toTrim = s.to.trim();
          if (!fromTrim) { appliedAll = false; break; }
          // Count occurrences of trimmed source.
          const occ = candidate.split(fromTrim).length - 1;
          if (occ !== 1) { appliedAll = false; break; }
          candidate = candidate.replace(fromTrim, toTrim);
        }
        if (!appliedAll) throw new Error(`hunk apply mismatch on ${f.path}`);
        newContent = candidate;
      }
      await putFile(f.path, branch, newContent, existing?.sha ?? null, result.commit);
    }

    const prBody = [
      `Auto-generated by Fix Agent for feedback \`${feedbackId}\`.`,
      '',
      `**Triage category**: ${feedback.triage_category ?? feedback.category}`,
      `**Severity**: ${feedback.severity ?? 'unknown'}`,
      `**Description**: ${feedback.description.slice(0, 400)}`,
      '',
      `**Diff size**: +${v.totalAdded} / -${v.totalRemoved} across ${v.files.length} file(s).`,
      '',
      'Distribution impact: pilot stability — auto-fix loop validation.',
      '',
      'This PR is in DRAFT until the Supervisor Agent reviews it.',
    ].join('\n');

    const pr = await openDraftPR(branch, `auto-fix: ${result.commit}`, prBody);
    prNumber = pr.number;
    prUrl = pr.url;
  } catch (e) {
    applyError = (e as Error).message;
  }

  // 8. Insert fix_attempts row.
  const status = applyError ? 'FAILED' : 'PROPOSED';
  const { data: inserted, error: insErr } = await supa
    .from('fix_attempts')
    .insert({
      feedback_id: feedbackId,
      branch_name: result.branch,
      pr_number: prNumber,
      pr_url: prUrl,
      diff_lines_added: v.totalAdded,
      diff_lines_removed: v.totalRemoved,
      files_touched: v.files.map((f) => f.path),
      commit_message: result.commit,
      agent_response_raw: result.raw as Record<string, unknown>,
      cost_usd: result.cost,
      status,
      rejection_reason: applyError,
    })
    .select('id')
    .single();

  if (!applyError) {
    await supa.from('feedback_reports').update({
      status: 'FIX_PROPOSED',
      fix_pr_url: prUrl,
      fix_pr_number: prNumber,
      fix_diff_lines: v.totalAdded + v.totalRemoved,
      fix_files_touched: v.files.map((f) => f.path),
    }).eq('id', feedbackId);
  } else {
    await supa.from('feedback_reports').update({ status: 'HUMAN_FIX_NEEDED' }).eq('id', feedbackId);
  }

  return json(200, {
    ok: !applyError,
    fix_attempt_id: inserted?.id,
    pr_number: prNumber,
    pr_url: prUrl,
    cost_usd: result.cost,
    error: applyError,
    insert_error: insErr,
  });
}

Deno.serve((req) =>
  handle(req).catch((e) => json(500, { error: 'unhandled', message: (e as Error).message })),
);
