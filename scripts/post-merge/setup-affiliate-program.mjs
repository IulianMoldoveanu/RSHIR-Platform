// Post-merge bootstrap for A14 affiliate program.
// Apply migration only — no new secrets (reuses PARTNER_VISITS_SALT for IP
// hashing, already provisioned by setup-reseller-whitelabel).
//
//   cd "C:/Users/Office HIR CEO/.hir/foisorul-a/scripts"
//   node "C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-chief/scripts/post-merge/setup-affiliate-program.mjs"

import { readFileSync } from 'node:fs';

const v = JSON.parse(readFileSync('C:/Users/Office HIR CEO/.hir/secrets.json', 'utf8'));
const REF = v.supabase.project_ref;
const PAT = v.supabase.management_pat;
const SUPABASE_URL = v.supabase.url;
const SERVICE = v.supabase.service_role_key;

console.log('[1/2] Apply migration...');
const sql = readFileSync(
  'C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-chief/supabase/migrations/20260505_001_affiliate_program.sql',
  'utf8',
);
const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
console.log('  ', r.status, r.ok ? 'OK' : await r.text());

console.log('[2/2] Smoke insert + cleanup...');
const test = await fetch(`${SUPABASE_URL}/rest/v1/affiliate_applications`, {
  method: 'POST',
  headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({
    full_name: 'Smoke Test',
    email: 'smoke-test-' + Date.now() + '@example.com',
    audience_type: 'OTHER',
    pitch: 'Bootstrap smoke test row — should be cleaned up immediately.',
    channels: [],
    status: 'SPAM',
  }),
});
console.log('  insert:', test.status);
await fetch(`${SUPABASE_URL}/rest/v1/affiliate_applications?email=like.smoke-test-*`, {
  method: 'DELETE',
  headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE },
});
console.log('  cleanup: done');
console.log('done.');
