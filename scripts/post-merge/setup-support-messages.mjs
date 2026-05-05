// Post-merge bootstrap for Lane U — In-app support chat panel.
//
// Steps:
//   1. Apply 20260605_003_support_messages.sql via Supabase Mgmt API.
//   2. Smoke-insert one row, verify, delete it.
//
// No new external secrets. Optional Telegram forwarding gated by env vars
// already provisioned by the feedback pipeline (TELEGRAM_BOT_TOKEN,
// TELEGRAM_IULIAN_CHAT_ID). Set TELEGRAM_HEPI_FORWARD_SUPPORT=true on
// restaurant-web Vercel project to enable forwarding.
//
//   node "C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-laneU/scripts/post-merge/setup-support-messages.mjs"

import { readFileSync } from 'node:fs';

const v = JSON.parse(readFileSync('C:/Users/Office HIR CEO/.hir/secrets.json', 'utf8'));
const REF = v.supabase.project_ref;
const PAT = v.supabase.management_pat;
const SUPABASE_URL = v.supabase.url;
const SERVICE = v.supabase.service_role_key;

console.log('[1/2] Apply migration...');
const sql = readFileSync(
  'C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-laneU/supabase/migrations/20260605_003_support_messages.sql',
  'utf8',
);
const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
console.log('  ', r.status, r.ok ? 'OK' : await r.text());

console.log('[2/2] Smoke insert + cleanup...');
const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/support_messages`, {
  method: 'POST',
  headers: {
    apikey: SERVICE,
    Authorization: 'Bearer ' + SERVICE,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify({
    email: 'smoke-test-' + Date.now() + '@example.com',
    category: 'OTHER',
    message: 'Bootstrap smoke test row — should be cleaned up immediately.',
    status: 'SPAM',
  }),
});
const insertText = await insertRes.text();
console.log('  insert:', insertRes.status, insertRes.ok ? 'OK' : insertText.slice(0, 200));

await fetch(`${SUPABASE_URL}/rest/v1/support_messages?email=like.smoke-test-*`, {
  method: 'DELETE',
  headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE },
});
console.log('  cleanup: done');

console.log('\nNext steps:');
console.log('  - To enable Telegram forwarding, set on restaurant-web Vercel project:');
console.log('      TELEGRAM_HEPI_FORWARD_SUPPORT=true');
console.log('      TELEGRAM_BOT_TOKEN, TELEGRAM_IULIAN_CHAT_ID (already set if feedback pipeline is live)');
console.log('done.');
