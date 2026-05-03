// One-shot backfill: synthesize github_pr_events rows for currently open PRs
// from REST API state. Marks event_type with `.backfill` suffix so future
// queries can distinguish from live webhook events.
//
// Usage: GITHUB_TOKEN=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/scripts/backfill-github-events.mjs
//
// Idempotent via delivery_id `backfill-pr-<n>-<event_kind>-<sha>`.

import { createClient } from '@supabase/supabase-js';

const REPO = 'IulianMoldoveanu/RSHIR-Platform';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qfmeojeipncuxeltnvab.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GITHUB_TOKEN || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing GITHUB_TOKEN or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function gh(path) {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error(`GH ${r.status} ${path}`);
  return r.json();
}

function classifyChecks(checkRuns) {
  const failed = checkRuns.filter(c => ['failure','cancelled','timed_out'].includes(c.conclusion));
  if (failed.length) return { severity: 'CRITICAL', summary: `${failed.length} check(s) failed: ${failed.map(c=>c.name).join(', ')}`.slice(0,300) };
  return { severity: 'INFO', summary: `${checkRuns.length} checks completed clean` };
}

async function insertEvent(row) {
  const { error } = await supa.from('github_pr_events').insert(row);
  if (error && error.code !== '23505') throw error;
  return error?.code === '23505' ? 'dup' : 'ok';
}

const prs = await gh(`/repos/${REPO}/pulls?state=open&per_page=20`);
console.log(`backfill ${prs.length} open PRs`);

let inserted = 0, deduped = 0;
for (const p of prs) {
  const sha = p.head.sha;
  // PR open event
  const a = await insertEvent({
    event_type: 'pull_request.opened.backfill',
    repo: REPO,
    pr_number: p.number,
    pr_title: p.title,
    pr_head_sha: sha,
    actor: p.user?.login,
    severity: 'INFO',
    summary: `PR #${p.number} open by ${p.user?.login}: ${p.title}`.slice(0,300),
    raw_payload: { backfill: true, pr_number: p.number },
    delivery_id: `backfill-pr-${p.number}-opened-${sha.slice(0,10)}`,
  });
  a === 'dup' ? deduped++ : inserted++;

  // Latest check-run state
  try {
    const checks = await gh(`/repos/${REPO}/commits/${sha}/check-runs`);
    if (checks.check_runs?.length) {
      const { severity, summary } = classifyChecks(checks.check_runs);
      const b = await insertEvent({
        event_type: 'check_run.completed.backfill',
        repo: REPO,
        pr_number: p.number,
        pr_title: p.title,
        pr_head_sha: sha,
        actor: 'github-actions[bot]',
        severity,
        summary,
        raw_payload: { backfill: true, check_runs_count: checks.check_runs.length },
        delivery_id: `backfill-pr-${p.number}-checks-${sha.slice(0,10)}`,
      });
      b === 'dup' ? deduped++ : inserted++;
    }
  } catch (e) { console.warn('checks err pr#' + p.number, e.message); }

  // Latest review state
  try {
    const reviews = await gh(`/repos/${REPO}/pulls/${p.number}/reviews`);
    const reqChanges = reviews.filter(r => r.state === 'CHANGES_REQUESTED');
    if (reqChanges.length) {
      const last = reqChanges[reqChanges.length-1];
      const c = await insertEvent({
        event_type: 'pull_request_review.submitted.backfill',
        repo: REPO,
        pr_number: p.number,
        pr_title: p.title,
        pr_head_sha: sha,
        actor: last.user?.login,
        severity: 'CRITICAL',
        summary: `Review CHANGES_REQUESTED by ${last.user?.login}: ${(last.body||'').slice(0,200)}`.slice(0,300),
        raw_payload: { backfill: true, review_id: last.id },
        delivery_id: `backfill-pr-${p.number}-review-${last.id}`,
      });
      c === 'dup' ? deduped++ : inserted++;
    }
  } catch (e) { console.warn('reviews err pr#' + p.number, e.message); }
}

console.log(`backfill done. inserted=${inserted} deduped=${deduped}`);
