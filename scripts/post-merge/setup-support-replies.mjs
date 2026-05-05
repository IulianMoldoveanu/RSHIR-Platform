// Post-merge bootstrap for Lane EMAIL-REPLY — admin reply flow with email-back.
//
// Steps:
//   1. Apply 20260605_004_support_replies.sql via Supabase Mgmt API.
//   2. Verify support_replies table + RESPONDED status accepted.
//
// Optional Vercel env (admin app) for Reply-To header:
//   HIR_SUPPORT_REPLY_TO=support@hir.ro   (default if unset)
//
// Resend key (RESEND_API_KEY, RESEND_FROM_EMAIL) is the same one already
// used by Lane N reservation emails — no new secret to provision.
//
// Run:
//   node "<path>/scripts/post-merge/setup-support-replies.mjs"

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, '../..');

const v = JSON.parse(readFileSync('C:/Users/Office HIR CEO/.hir/secrets.json', 'utf8'));
const REF = v.supabase.project_ref;
const PAT = v.supabase.management_pat;
const SUPABASE_URL = v.supabase.url;
const SERVICE = v.supabase.service_role_key;

console.log('[1/2] Apply migration 20260605_004_support_replies.sql...');
const sql = readFileSync(
  pathResolve(REPO_ROOT, 'supabase/migrations/20260605_004_support_replies.sql'),
  'utf8',
);
const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
console.log('  ', r.status, r.ok ? 'OK' : await r.text());

console.log('[2/2] Smoke verify support_replies + RESPONDED status...');
const tableProbe = await fetch(`${SUPABASE_URL}/rest/v1/support_replies?select=id&limit=1`, {
  headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE },
});
console.log('  support_replies select:', tableProbe.status, tableProbe.ok ? 'OK' : await tableProbe.text());

// Verify the RESPONDED status is now accepted by inserting + deleting a probe row.
const probeMessageRes = await fetch(`${SUPABASE_URL}/rest/v1/support_messages`, {
  method: 'POST',
  headers: {
    apikey: SERVICE,
    Authorization: 'Bearer ' + SERVICE,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify({
    email: 'smoke-respond-' + Date.now() + '@example.com',
    category: 'OTHER',
    message: 'Lane EMAIL-REPLY smoke — RESPONDED constraint check.',
    status: 'RESPONDED',
  }),
});
const probeText = await probeMessageRes.text();
console.log('  RESPONDED insert:', probeMessageRes.status, probeMessageRes.ok ? 'OK' : probeText.slice(0, 200));

await fetch(`${SUPABASE_URL}/rest/v1/support_messages?email=like.smoke-respond-*`, {
  method: 'DELETE',
  headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE },
});
console.log('  cleanup: done');

console.log('\nNext steps:');
console.log('  - Optional: set HIR_SUPPORT_REPLY_TO on hir-restaurant-admin Vercel project');
console.log('    (default = support@hir.ro if unset)');
console.log('  - Resend env (RESEND_API_KEY, RESEND_FROM_EMAIL) is shared with Lane N — no new keys');
console.log('done.');
