// One-shot: apply ONLY the v3 reseller program migrations (Day 1 + Day 2)
// to Supabase prod. Used because run-all-pending --apply also tries to
// apply pre-existing missing migrations (ai_master_orchestrator etc.) that
// have their own dependency issues.
//
// Run from repo root:
//   node scripts/post-merge/apply-v3-only.mjs
//
// Idempotent — every migration uses CREATE IF NOT EXISTS / ALTER ADD COLUMN
// IF NOT EXISTS / ON CONFLICT DO NOTHING.

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VAULT_PATH = 'C:/Users/Office HIR CEO/.hir/secrets.json';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const MIG_DIR = join(REPO_ROOT, 'supabase', 'migrations');

const V3_MIGRATIONS = [
  '20260516_010_v3_partner_sponsors.sql',
  '20260516_011_v3_reseller_leads.sql',
  '20260516_012_v3_champion_referrals.sql',
  '20260516_013_v3_partner_waves.sql',
  '20260516_014_v3_ladder_milestones.sql',
  '20260516_015_v3_partner_kyc_and_activity.sql',
  '20260516_016_v3_partner_commissions_extend.sql',
  '20260516_017_v3_bonus_cron.sql',
  '20260517_001_v3_champion_rewards_cron.sql',
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

for (const name of V3_MIGRATIONS) {
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

console.log('\nAll v3 migrations applied.');
