// Post-merge bootstrap for Lane G — Stripe webhook idempotency.
// Applies migration 20260504_003_stripe_webhook_idempotency.sql via Supabase
// Mgmt API. Additive-only (CREATE TABLE/INDEX IF NOT EXISTS), so safe to
// re-run. Per Strategy v2: Chief autonomy on additive schema → auto-apply
// after PR merge.
//
//   node "C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-laneG/scripts/post-merge/setup-stripe-webhook-idempotency.mjs"

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const VAULT_PATH = 'C:/Users/Office HIR CEO/.hir/secrets.json';
const v = JSON.parse(readFileSync(VAULT_PATH, 'utf8'));
const SUPABASE_REF = v.supabase.project_ref;
const SUPABASE_PAT = v.supabase.management_pat;
const SERVICE_ROLE = v.supabase.service_role_key;
const SUPABASE_URL = v.supabase.url;

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(here, '..', '..', 'supabase', 'migrations', '20260504_003_stripe_webhook_idempotency.sql');
const sql = readFileSync(sqlPath, 'utf8');

console.log('[stripe-webhook-idempotency] applying migration:', sqlPath);

const apply = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + SUPABASE_PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
if (!apply.ok) {
  console.error('[stripe-webhook-idempotency] migration failed:', apply.status, await apply.text());
  process.exit(1);
}
console.log('[stripe-webhook-idempotency] migration applied: 200 OK');

// Verify: insert a synthetic row, read it back, then clean up. Confirms the
// table exists, RLS lets the service role write, and the unique constraint
// is wired (second insert with same id MUST 409).
const testId = 'evt_smoke_' + Date.now();
const headers = {
  apikey: SERVICE_ROLE,
  Authorization: 'Bearer ' + SERVICE_ROLE,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

const ins1 = await fetch(`${SUPABASE_URL}/rest/v1/stripe_events_processed`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ id: testId, event_type: 'smoke.test' }),
});
console.log('[stripe-webhook-idempotency] insert#1:', ins1.status, ins1.ok ? 'OK' : await ins1.text());

const ins2 = await fetch(`${SUPABASE_URL}/rest/v1/stripe_events_processed`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ id: testId, event_type: 'smoke.test' }),
});
console.log(
  '[stripe-webhook-idempotency] insert#2 (dup):',
  ins2.status,
  ins2.status === 409 ? 'OK (unique blocks dup)' : 'UNEXPECTED — investigate',
);

await fetch(`${SUPABASE_URL}/rest/v1/stripe_events_processed?id=eq.${testId}`, {
  method: 'DELETE',
  headers: { apikey: SERVICE_ROLE, Authorization: 'Bearer ' + SERVICE_ROLE },
});
console.log('[stripe-webhook-idempotency] cleanup: done');
