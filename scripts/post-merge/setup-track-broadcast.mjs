// Lane RT-PUSH — track-broadcast setup.
//
// What this script does:
//   1. Applies migration 20260606_004_track_realtime_broadcast.sql via the
//      Supabase Mgmt API. The migration is additive — adds one PL/pgSQL
//      function and one trigger; existing rows are not touched.
//   2. PRINTS the vault-secret command Iulian needs to run ONCE so the
//      trigger can find the Edge Function URL. We do not run vault.* DDL
//      from a script: that's a deliberate operator action.
//   3. PRINTS the deploy command for the Edge Function.
//
// The function reuses the existing `notify_new_order_secret` shared secret
// (already set on the function as `HIR_NOTIFY_SECRET`) — no new secret
// rotation required.
//
// Invocation:
//   APPLY=1 node scripts/post-merge/setup-track-broadcast.mjs
//
// Safety:
//   - DRY-RUN by default; APPLY=1 actually hits the Mgmt API.
//   - Migration is idempotent (CREATE OR REPLACE + drop trigger if exists).

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VAULT_PATH = join(homedir(), '.hir', 'secrets.json');
const v = JSON.parse(readFileSync(VAULT_PATH, 'utf8'));
const PROJECT_REF = v.supabase.project_ref || v.supabase.projectRef;
const PAT = v.supabase.management_pat || v.supabase.managementPat;

if (!PROJECT_REF || !PAT) {
  console.error('Missing supabase.project_ref or supabase.management_pat in vault.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const migrationPath = resolve(
  repoRoot,
  'supabase',
  'migrations',
  '20260606_005_track_realtime_broadcast.sql',
);
const sql = readFileSync(migrationPath, 'utf8');

const APPLY = process.env.APPLY === '1';

console.log('==========================================================');
console.log('Lane RT-PUSH — track-broadcast setup');
console.log('==========================================================');
console.log(`Mode:        ${APPLY ? 'APPLY (will hit Mgmt API)' : 'DRY RUN (no DB writes)'}`);
console.log(`Project ref: ${PROJECT_REF}`);
console.log(`Migration:   ${migrationPath}`);
console.log(`SQL bytes:   ${sql.length}`);
console.log('==========================================================');

if (APPLY) {
  console.log('\n[1/1] Applying migration via Mgmt API...');
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await r.text();
  console.log('  status:', r.status, r.ok ? 'OK' : 'FAILED');
  if (!r.ok) {
    console.error('  body:', text);
    process.exit(1);
  }
  console.log('  Migration applied. Trigger active for FUTURE status updates only.');
} else {
  console.log('\n(skipping migration apply — set APPLY=1 to run it)');
}

console.log('\n----------------------------------------------------------');
console.log('NEXT STEPS — operator action required:');
console.log('----------------------------------------------------------');

console.log('\n[A] Deploy the track-broadcast Edge Function:');
console.log('--------------------------------------------------------------');
console.log('SUPABASE_ACCESS_TOKEN=$(cat ~/.hir/secrets.json | jq -r .supabase.management_pat) \\');
console.log('  node supabase/deploy-function.mjs track-broadcast');

console.log('\n[B] Register the function URL in Supabase Vault (so the trigger can find it):');
console.log('--------------------------------------------------------------');
console.log(`-- Run in the Supabase SQL editor (or via Mgmt API):
select vault.create_secret(
  'https://${PROJECT_REF}.functions.supabase.co/track-broadcast',
  'track_broadcast_url',
  'track-broadcast Edge Function URL'
);`);

console.log('\n[C] Smoke test:');
console.log('--------------------------------------------------------------');
console.log('-- 1. Open the track page for an in-flight order:');
console.log('     /track/<public_track_token>');
console.log('-- 2. From admin, advance the order status (e.g. PENDING -> CONFIRMED).');
console.log('-- 3. The track page UI should update WITHOUT waiting 30s for the poll.');
console.log('-- 4. If the user previously granted Notification permission and the tab');
console.log('     is hidden, a localized in-page Notification should fire.');

console.log('\n----------------------------------------------------------');
console.log('Done. After [A] + [B], the broadcast pipeline is live.');
console.log('----------------------------------------------------------');
