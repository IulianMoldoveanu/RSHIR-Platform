// Post-merge bootstrap for Lane STATUS — public status page.
// Applies migration 20260605_004_status_page.sql via Supabase Mgmt API.
//
//   node scripts/post-merge/setup-status-page.mjs
//
// Idempotent: re-running no-ops on CREATE-IF-NOT-EXISTS + DROP/CREATE policies.

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
  'supabase/migrations/20260605_004_status_page.sql',
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

console.log(`[status-page] applying migration ${SQL_PATH}`);
await runSql(sql);
console.log('[status-page] migration applied OK');

const verify = await runSql(`
  select table_name
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('health_check_pings', 'public_incidents')
  order by table_name;
`);
console.log('[status-page] tables present:', JSON.stringify(verify, null, 2));

const policies = await runSql(`
  select tablename, policyname, cmd, roles
  from pg_policies
  where schemaname = 'public'
    and tablename in ('health_check_pings', 'public_incidents')
  order by tablename, policyname;
`);
console.log('[status-page] policies:', JSON.stringify(policies, null, 2));

console.log('[status-page] DONE. Next: redeploy health-monitor edge function so it starts recording pings:');
console.log('  node supabase/deploy-function.mjs health-monitor');
