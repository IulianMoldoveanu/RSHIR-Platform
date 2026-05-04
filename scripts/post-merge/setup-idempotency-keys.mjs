// Post-merge bootstrap for A3 idempotency-keys (PR rshir/A3-idempotency-key).
// Applies migration 20260504_011_idempotency_keys.sql via Supabase Mgmt API.
// Run AFTER PR merge with explicit user OK.
//
//   cd "C:/Users/Office HIR CEO/.hir/foisorul-a/scripts"
//   node "C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-chief/scripts/post-merge/setup-idempotency-keys.mjs"

import { readFileSync } from 'node:fs';

const VAULT_PATH = 'C:/Users/Office HIR CEO/.hir/secrets.json';
const v = JSON.parse(readFileSync(VAULT_PATH, 'utf8'));
const SUPABASE_REF = v.supabase.project_ref;
const SUPABASE_PAT = v.supabase.management_pat;

const sql = readFileSync(
  'C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-chief/supabase/migrations/20260504_011_idempotency_keys.sql',
  'utf8',
);

const r = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + SUPABASE_PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
console.log('migration apply:', r.status, r.ok ? 'OK' : await r.text());

// Smoke: insert + read + delete
if (r.ok) {
  const testRow = await fetch(`${v.supabase.url}/rest/v1/idempotency_keys`, {
    method: 'POST',
    headers: {
      apikey: v.supabase.service_role_key,
      Authorization: 'Bearer ' + v.supabase.service_role_key,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      tenant_id: '00000000-0000-0000-0000-000000000001',
      idempotency_key: 'test-bootstrap-key-' + Date.now(),
      request_hash: 'a'.repeat(64),
      response: { ok: 'bootstrap test' },
      status_code: 200,
    }),
  });
  console.log('insert test:', testRow.status);

  // Cleanup
  await fetch(`${v.supabase.url}/rest/v1/idempotency_keys?idempotency_key=like.test-bootstrap-*`, {
    method: 'DELETE',
    headers: {
      apikey: v.supabase.service_role_key,
      Authorization: 'Bearer ' + v.supabase.service_role_key,
    },
  });
  console.log('cleanup: done');
}
