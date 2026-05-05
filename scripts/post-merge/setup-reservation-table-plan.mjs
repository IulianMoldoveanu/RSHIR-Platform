// Post-merge bootstrap for Lane Y3 — reservation table-plan picker.
// Applies migration 20260606_004_reservation_table_plan.sql via Supabase Mgmt API.
//
//   node scripts/post-merge/setup-reservation-table-plan.mjs
//
// Idempotent: ALTER TABLE ... ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE
// FUNCTION + DROP IF EXISTS on the legacy 7-arg signature. Safe to re-run.

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
  'supabase/migrations/20260606_004_reservation_table_plan.sql',
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

console.log(`[reservation-table-plan] applying migration ${SQL_PATH}`);
await runSql(sql);
console.log('[reservation-table-plan] migration applied OK');

const cols = await runSql(`
  select column_name, data_type
  from information_schema.columns
  where table_schema = 'public'
    and (
      (table_name = 'reservation_settings' and column_name in ('table_plan', 'show_table_plan_to_customers'))
      or (table_name = 'reservations' and column_name = 'table_id')
    )
  order by table_name, column_name;
`);
console.log('[reservation-table-plan] columns:', JSON.stringify(cols, null, 2));

const fns = await runSql(`
  select p.proname, pg_get_function_arguments(p.oid) as args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('fn_reservation_request', 'fn_reserved_table_ids')
  order by p.proname;
`);
console.log('[reservation-table-plan] functions:', JSON.stringify(fns, null, 2));

console.log('[reservation-table-plan] DONE.');
