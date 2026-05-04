// Post-merge bootstrap for the Health Monitor (PR introduced 2026-05-04, A2 task).
// RUN ONCE after merge with explicit user OK — applies migration, generates token,
// sets Supabase + GitHub secrets, deploys edge function.
//
// Vault path expected at C:/Users/Office HIR CEO/.hir/secrets.json (off-workspace).
// Run from C:/Users/Office HIR CEO/.hir/foisorul-a/scripts/ (has libsodium-wrappers).
//
//   cd "C:/Users/Office HIR CEO/.hir/foisorul-a/scripts"
//   node "C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-chief/scripts/post-merge/setup-health-monitor.mjs"

import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import sodium from 'libsodium-wrappers';

const VAULT_PATH = 'C:/Users/Office HIR CEO/.hir/secrets.json';
const v = JSON.parse(readFileSync(VAULT_PATH, 'utf8'));
const SUPABASE_REF = v.supabase.project_ref;
const SUPABASE_PAT = v.supabase.management_pat;
const SUPABASE_URL = v.supabase.url;
const GH_TOKEN = v.github.token;
const REPO = 'IulianMoldoveanu/RSHIR-Platform';

const HEALTH_TOKEN = randomBytes(24).toString('hex');

const migrationSql = `create table if not exists public.health_monitor_state (
  app text primary key,
  last_ok boolean not null,
  failed_since timestamptz,
  last_checked_at timestamptz not null default now()
);
alter table public.health_monitor_state enable row level security;
drop policy if exists "service_role_only_health_monitor_state" on public.health_monitor_state;
create policy "service_role_only_health_monitor_state"
  on public.health_monitor_state for all to service_role using (true) with check (true);`;

const migR = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + SUPABASE_PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: migrationSql }),
});
console.log('migration:', migR.status, migR.ok ? 'OK' : await migR.text());

await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/secrets`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + SUPABASE_PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify([{ name: 'HEALTH_MONITOR_TOKEN', value: HEALTH_TOKEN }]),
}).then((r) => console.log('supabase HEALTH_MONITOR_TOKEN:', r.status));

const listR = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/secrets`, {
  headers: { Authorization: 'Bearer ' + SUPABASE_PAT },
});
const existing = await listR.json();
const names = new Set((Array.isArray(existing) ? existing : []).map((s) => s.name));
if (!names.has('TELEGRAM_CHAT_ID')) {
  await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/secrets`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + SUPABASE_PAT, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ name: 'TELEGRAM_CHAT_ID', value: v.telegram.iulian_chat_id }]),
  }).then((r) => console.log('supabase TELEGRAM_CHAT_ID:', r.status));
}
if (!names.has('TELEGRAM_BOT_TOKEN')) {
  await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/secrets`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + SUPABASE_PAT, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ name: 'TELEGRAM_BOT_TOKEN', value: v.telegram.bot_api_token }]),
  }).then((r) => console.log('supabase TELEGRAM_BOT_TOKEN:', r.status));
}

await sodium.ready;
const keyR = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, {
  headers: { Authorization: 'token ' + GH_TOKEN, 'Accept': 'application/vnd.github+json' },
});
const keyJ = await keyR.json();
const enc = sodium.crypto_box_seal(sodium.from_string(HEALTH_TOKEN), sodium.from_base64(keyJ.key, sodium.base64_variants.ORIGINAL));
const ghSecR = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/HEALTH_MONITOR_TOKEN`, {
  method: 'PUT',
  headers: { Authorization: 'token ' + GH_TOKEN, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
  body: JSON.stringify({ encrypted_value: sodium.to_base64(enc, sodium.base64_variants.ORIGINAL), key_id: keyJ.key_id }),
});
console.log('github HEALTH_MONITOR_TOKEN:', ghSecR.status);

const fnSource = readFileSync(
  'C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-chief/supabase/functions/health-monitor/index.ts',
  'utf8',
);
const fnR = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/functions`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + SUPABASE_PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify({ slug: 'health-monitor', name: 'health-monitor', body: fnSource, verify_jwt: false }),
});
console.log('fn create:', fnR.status);
if (fnR.status >= 400) {
  const patchR = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/functions/health-monitor`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + SUPABASE_PAT, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: fnSource, verify_jwt: false }),
  });
  console.log('fn patch:', patchR.status);
}

v.supabase.health_monitor_token = HEALTH_TOKEN;
writeFileSync(VAULT_PATH, JSON.stringify(v, null, 2));

const smokeR = await fetch(SUPABASE_URL + '/functions/v1/health-monitor', {
  method: 'POST',
  headers: { 'X-Health-Token': HEALTH_TOKEN, 'Content-Type': 'application/json' },
});
console.log('smoke:', smokeR.status);
if (smokeR.ok) console.log(JSON.stringify(await smokeR.json(), null, 2));
