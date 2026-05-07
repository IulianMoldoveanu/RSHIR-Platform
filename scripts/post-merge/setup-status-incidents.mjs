// Post-merge bootstrap for Lane STATUS-INCIDENTS-ADMIN.
// Applies migration 20260508_003_status_incidents_admin.sql via Supabase
// Mgmt API. Adds resolved_by/updated_at to public_incidents, creates the
// public_incident_status_log table, and schedules the 90-day retention cron
// for health_check_pings.
//
// Idempotent: re-running no-ops on ADD-COLUMN-IF-NOT-EXISTS, CREATE-IF-NOT-
// EXISTS, DROP/CREATE policies, and DO/cron.unschedule + cron.schedule.
//
//   node scripts/post-merge/setup-status-incidents.mjs

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
  'supabase/migrations/20260508_003_status_incidents_admin.sql',
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

console.log(`[status-incidents] applying migration ${SQL_PATH}`);
await runSql(sql);
console.log('[status-incidents] migration applied OK');

const tables = await runSql(`
  select table_name
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('public_incidents', 'public_incident_status_log')
  order by table_name;
`);
console.log('[status-incidents] tables present:', JSON.stringify(tables, null, 2));

const cols = await runSql(`
  select column_name, is_nullable, data_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'public_incidents'
    and column_name in ('resolved_by', 'updated_at')
  order by column_name;
`);
console.log('[status-incidents] new columns on public_incidents:', JSON.stringify(cols, null, 2));

const cron = await runSql(`
  select jobname, schedule, active
  from cron.job
  where jobname = 'health-check-pings-retention';
`);
console.log('[status-incidents] retention cron:', JSON.stringify(cron, null, 2));

console.log('[status-incidents] DONE.');
