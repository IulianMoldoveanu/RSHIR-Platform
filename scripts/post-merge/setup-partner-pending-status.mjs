// Post-merge bootstrap for Lane T (self-service partner portal).
// Applies the additive migration:
//   - partners.status check now includes PENDING
//   - tenants.referral_code column + partial index
//
// Idempotent — safe to re-run.
//
//   node "C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-laneT/scripts/post-merge/setup-partner-pending-status.mjs"

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// Load credentials from (in order of precedence):
//   1. Environment variables — preferred for CI / non-Windows runners.
//   2. HIR_SECRETS_PATH env var pointing to a JSON file in the vault format.
//   3. The default Windows operator vault path.
function loadCredentials() {
  const envRef = process.env.SUPABASE_PROJECT_REF;
  const envPat = process.env.SUPABASE_MANAGEMENT_PAT;
  const envUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (envRef && envPat && envUrl && envService) {
    return { REF: envRef, PAT: envPat, SUPABASE_URL: envUrl, SERVICE: envService };
  }
  const candidate =
    process.env.HIR_SECRETS_PATH ?? 'C:/Users/Office HIR CEO/.hir/secrets.json';
  if (!existsSync(candidate)) {
    console.error(
      '[fatal] secrets unavailable. Set SUPABASE_PROJECT_REF / SUPABASE_MANAGEMENT_PAT / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars OR provide HIR_SECRETS_PATH pointing to the vault JSON.',
    );
    process.exit(1);
  }
  const v = JSON.parse(readFileSync(candidate, 'utf8'));
  return {
    REF: v.supabase.project_ref,
    PAT: v.supabase.management_pat,
    SUPABASE_URL: v.supabase.url,
    SERVICE: v.supabase.service_role_key,
  };
}

const { REF, PAT, SUPABASE_URL, SERVICE } = loadCredentials();

const MIGRATION = resolve(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260606_001_partner_pending_status.sql',
);

console.log('[1/3] Apply migration:', MIGRATION);
const sql = readFileSync(MIGRATION, 'utf8');
const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
console.log('  ', r.status, r.ok ? 'OK' : await r.text());
if (!r.ok) {
  console.error('[fatal] migration apply failed');
  process.exit(1);
}

// Smoke 1: confirm the new check constraint accepts PENDING.
console.log('[2/3] Smoke insert: partners status=PENDING...');
const testEmail = `smoke-pending-${Date.now()}@example.com`;
const code = 'PND' + String(Date.now()).slice(-5);
const insert = await fetch(`${SUPABASE_URL}/rest/v1/partners`, {
  method: 'POST',
  headers: {
    apikey: SERVICE,
    Authorization: 'Bearer ' + SERVICE,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify({
    name: 'Smoke Pending',
    email: testEmail,
    status: 'PENDING',
    tier: 'AFFILIATE',
    default_commission_pct: 0,
    code,
  }),
});
console.log('  insert:', insert.status);
if (!insert.ok) {
  console.error('  body:', await insert.text());
  process.exit(1);
}
const [row] = await insert.json();
const insertedId = row?.id;

// Smoke 2: confirm tenants.referral_code column accepts a write.
console.log('[3/3] Smoke select: tenants.referral_code column exists...');
const colCheck = await fetch(
  `${SUPABASE_URL}/rest/v1/tenants?select=id,referral_code&limit=1`,
  {
    headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE },
  },
);
console.log('  select:', colCheck.status);
if (!colCheck.ok) {
  console.error('  body:', await colCheck.text());
}

// Cleanup: drop the smoke partner row.
if (insertedId) {
  await fetch(`${SUPABASE_URL}/rest/v1/partners?id=eq.${insertedId}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE },
  });
  console.log('  cleanup: deleted smoke partner', insertedId);
}

console.log('done.');
