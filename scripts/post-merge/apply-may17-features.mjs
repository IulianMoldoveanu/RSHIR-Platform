// One-shot: apply the May 17 feature migrations (Customer Reactivation,
// Demand Forecaster, Voice order source, Country-ready foundations) to
// Supabase prod via Mgmt API. Same pattern as apply-v3-only.mjs.
//
// Run from repo root:
//   node scripts/post-merge/apply-may17-features.mjs
//
// All migrations are additive (CREATE IF NOT EXISTS / ALTER ADD COLUMN
// IF NOT EXISTS / ALTER TYPE ADD VALUE IF NOT EXISTS).

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VAULT_PATH = 'C:/Users/Office HIR CEO/.hir/secrets.json';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const MIG_DIR = join(REPO_ROOT, 'supabase', 'migrations');

const MAY17_MIGRATIONS = [
  '20260517_001_customer_reactivation.sql',
  '20260517_001_voice_order_source.sql',
  '20260517_100_demand_forecast.sql',
  '20260517_101_demand_forecast_cron.sql',
  '20260518_001_tenants_country_currency.sql',
];

const vault = JSON.parse(readFileSync(VAULT_PATH, 'utf8'));
const REF = vault.supabase.project_ref;
const PAT = vault.supabase.management_pat;

if (!REF || !PAT) {
  console.error('Vault missing supabase.project_ref or management_pat');
  process.exit(2);
}

async function runSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAT}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`mgmt API ${res.status}: ${t}`);
  }
  return res.json();
}

for (const name of MAY17_MIGRATIONS) {
  const path = join(MIG_DIR, name);
  const sql = readFileSync(path, 'utf8');
  process.stdout.write(`applying ${name}... `);
  try {
    await runSql(sql);
    console.log('OK');
  } catch (e) {
    console.log('FAIL');
    console.error(e.message);
    process.exit(1);
  }
}

console.log('\nAll May 17 feature migrations applied.');
