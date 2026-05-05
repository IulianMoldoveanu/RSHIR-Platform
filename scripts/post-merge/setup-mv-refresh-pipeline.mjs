// Post-merge bootstrap for Lane X — MV refresh pipeline.
// Applies migration 20260605_003_mv_refresh_pipeline.sql via Supabase Mgmt API.
//
//   node scripts/post-merge/setup-mv-refresh-pipeline.mjs
//
// Idempotent: re-running just no-ops on the CREATE-IF-NOT-EXISTS / OR REPLACE
// statements and re-schedules the cron job to the same shape.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const vault = JSON.parse(readFileSync(join(homedir(), '.hir', 'secrets.json'), 'utf8'));
const PROJECT_REF = vault.supabase.project_ref || vault.supabase.projectRef;
const PAT = vault.supabase.management_pat || vault.supabase.managementPat;

if (!PROJECT_REF || !PAT) {
  console.error('Missing supabase.project_ref or supabase.management_pat in vault.');
  process.exit(1);
}

const SQL_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260605_003_mv_refresh_pipeline.sql',
);
const sql = readFileSync(SQL_PATH, 'utf8');

async function runSql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

console.log(`[mv-refresh] applying migration ${SQL_PATH}`);
await runSql(sql);
console.log('[mv-refresh] migration applied OK');

// Smoke: trigger one logged refresh of the existing growth MV and
// verify the audit row landed.
console.log('[mv-refresh] smoke: refresh_mv_logged on mv_growth_tenant_metrics_30d');
await runSql(
  `select public.refresh_mv_logged('public', 'mv_growth_tenant_metrics_30d', true);`,
);

const verify = await runSql(`
  select mv_name, started_at, finished_at, duration_ms, row_count_after, error
  from public.mv_refresh_log
  order by started_at desc
  limit 3;
`);
console.log('[mv-refresh] last 3 log entries:', JSON.stringify(verify, null, 2));

const cron = await runSql(`
  select jobname, schedule, command
  from cron.job
  where jobname = 'refresh-growth-mv-daily';
`);
console.log('[mv-refresh] cron job:', JSON.stringify(cron, null, 2));

console.log('[mv-refresh] DONE.');
