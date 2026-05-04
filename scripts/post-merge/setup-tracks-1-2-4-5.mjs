// Post-merge bootstrap for A15 follow-ups (Tracks 1+2+3+4+5):
// - 20260505_002_gloriafood_imports.sql
// - 20260505_003_affiliate_bounties.sql
// - 20260505_004_marketing_assets.sql
//
// All migrations are additive. No new env vars required.

import { readFileSync } from 'node:fs';
const v = JSON.parse(readFileSync('C:/Users/Office HIR CEO/.hir/secrets.json', 'utf8'));
const REF = v.supabase.project_ref;
const PAT = v.supabase.management_pat;

const FILES = [
  'supabase/migrations/20260505_002_gloriafood_imports.sql',
  'supabase/migrations/20260505_003_affiliate_bounties.sql',
  'supabase/migrations/20260505_004_marketing_assets.sql',
];

for (const f of FILES) {
  console.log(`[mig] ${f}`);
  const sql = readFileSync(`C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-chief/${f}`, 'utf8');
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + PAT, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  console.log('    ', r.status, r.ok ? 'OK' : (await r.text()).substring(0, 200));
}

console.log('done. After Vercel redeploys, /dashboard/admin/affiliates + /reseller/resources + Cmd-K go live.');
