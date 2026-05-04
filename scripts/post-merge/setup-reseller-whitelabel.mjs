// Post-merge bootstrap for A12 reseller white-label.
// Apply migration + add PARTNER_VISITS_SALT secret to web app via Vercel.

import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const VAULT = 'C:/Users/Office HIR CEO/.hir/secrets.json';
const v = JSON.parse(readFileSync(VAULT, 'utf8'));
const REF = v.supabase.project_ref;
const PAT = v.supabase.management_pat;
const VERCEL_TOKEN = v.vercel.token;
const WEB_PROJECT_ID = v.vercel.projects['hir-restaurant-web'].id;

const SALT = randomBytes(24).toString('hex');

console.log('[1/2] Apply migration...');
const sql = readFileSync(
  'C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-chief/supabase/migrations/20260504_013_reseller_whitelabel.sql',
  'utf8',
);
const m = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
console.log('  ', m.status, m.ok ? 'OK' : await m.text());

console.log('[2/2] Set PARTNER_VISITS_SALT in Vercel (web app)...');
const eR = await fetch(`https://api.vercel.com/v10/projects/${WEB_PROJECT_ID}/env`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + VERCEL_TOKEN, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key: 'PARTNER_VISITS_SALT',
    value: SALT,
    type: 'sensitive',
    target: ['production', 'preview'],
  }),
});
console.log('  ', eR.status, eR.ok ? 'OK' : (await eR.text()).substring(0, 200));

v.supabase.partner_visits_salt = SALT;
writeFileSync(VAULT, JSON.stringify(v, null, 2));
console.log('done. Re-deploy web app to pick up the env var.');
