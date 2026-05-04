// Post-merge bootstrap for A11 codex-review-poll.
// Apply migration + generate token + Supabase secret + GH repo secret + deploy fn.
// Run AFTER merge with explicit user OK.

import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import sodium from 'libsodium-wrappers';

const VAULT = 'C:/Users/Office HIR CEO/.hir/secrets.json';
const v = JSON.parse(readFileSync(VAULT, 'utf8'));
const REF = v.supabase.project_ref;
const PAT = v.supabase.management_pat;
const SUPABASE_URL = v.supabase.url;
const GH = v.github.token;
const REPO = 'IulianMoldoveanu/RSHIR-Platform';
const POLL_TOKEN = randomBytes(24).toString('hex');

console.log('[1/5] Apply migration...');
const sql = readFileSync(
  'C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-chief/supabase/migrations/20260504_012_codex_review_tracking.sql',
  'utf8',
);
const m = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
console.log('  ', m.status, m.ok ? 'OK' : await m.text());

console.log('[2/5] Set Supabase secrets (CODEX_POLL_TOKEN)...');
await fetch(`https://api.supabase.com/v1/projects/${REF}/secrets`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify([{ name: 'CODEX_POLL_TOKEN', value: POLL_TOKEN }]),
}).then((r) => console.log('  ', r.status));

console.log('[3/5] Set GH repo secret (sealed via libsodium)...');
await sodium.ready;
const keyR = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, {
  headers: { Authorization: 'token ' + GH, Accept: 'application/vnd.github+json' },
});
const keyJ = await keyR.json();
const enc = sodium.crypto_box_seal(
  sodium.from_string(POLL_TOKEN),
  sodium.from_base64(keyJ.key, sodium.base64_variants.ORIGINAL),
);
const ghR = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/CODEX_POLL_TOKEN`, {
  method: 'PUT',
  headers: { Authorization: 'token ' + GH, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
  body: JSON.stringify({ encrypted_value: sodium.to_base64(enc, sodium.base64_variants.ORIGINAL), key_id: keyJ.key_id }),
});
console.log('  ', ghR.status);

console.log('[4/5] Deploy edge fn codex-review-poll...');
const src = readFileSync(
  'C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-chief/supabase/functions/codex-review-poll/index.ts',
  'utf8',
);
const fn = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify({ slug: 'codex-review-poll', name: 'codex-review-poll', body: src, verify_jwt: false }),
});
console.log('  create:', fn.status);
if (fn.status >= 400) {
  const p = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions/codex-review-poll`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + PAT, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: src, verify_jwt: false }),
  });
  console.log('  patch:', p.status);
}

console.log('[5/5] Smoke run + save token to vault...');
const sm = await fetch(SUPABASE_URL + '/functions/v1/codex-review-poll', {
  method: 'POST',
  headers: { 'X-Poll-Token': POLL_TOKEN, 'Content-Type': 'application/json' },
});
console.log('  smoke:', sm.status);
if (sm.ok) console.log('  ', JSON.stringify(await sm.json()));

v.supabase.codex_poll_token = POLL_TOKEN;
writeFileSync(VAULT, JSON.stringify(v, null, 2));
console.log('done.');
