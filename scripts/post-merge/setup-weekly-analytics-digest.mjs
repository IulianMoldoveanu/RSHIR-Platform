// Post-merge bootstrap for Lane ANALYTICS-DIGEST.
//
//   node scripts/post-merge/setup-weekly-analytics-digest.mjs
//
// Steps:
//   1. Apply migration 20260606_006_weekly_analytics_digest.sql via Mgmt API.
//   2. Ensure the vault secret `weekly_analytics_digest_url` exists (idempotent).
//   3. Print the cron job + a quick row count from analytics_digest_log.
//
// Idempotent: re-running just no-ops migrations + re-shapes the cron + ensures
// the vault secret is set.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const vault = JSON.parse(readFileSync(join(homedir(), '.hir', 'secrets.json'), 'utf8'));
const PROJECT_REF = vault.supabase.project_ref || vault.supabase.projectRef;
const PAT = vault.supabase.management_pat || vault.supabase.managementPat;

if (!PROJECT_REF || !PAT) {
  console.error('Missing supabase.project_ref or supabase.management_pat in vault.');
  process.exit(1);
}

const FN_URL = `https://${PROJECT_REF}.functions.supabase.co/weekly-analytics-digest`;
const SQL_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260606_006_weekly_analytics_digest.sql',
);
const sql = readFileSync(SQL_PATH, 'utf8');

async function runSql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

console.log(`[weekly-analytics-digest] applying migration ${SQL_PATH}`);
await runSql(sql);
console.log('[weekly-analytics-digest] migration applied OK');

// Vault secret for the cron job. Idempotent: vault.create_secret raises if it
// already exists, so we check first.
console.log(`[weekly-analytics-digest] ensuring vault secret weekly_analytics_digest_url -> ${FN_URL}`);
const existing = await runSql(
  `select name from vault.decrypted_secrets where name = 'weekly_analytics_digest_url' limit 1;`,
);
const hasSecret = Array.isArray(existing) && existing.length > 0;
if (hasSecret) {
  // Update in case the project ref changed (rare).
  await runSql(`
    update vault.secrets
    set secret = '${FN_URL.replace(/'/g, "''")}'
    where name = 'weekly_analytics_digest_url';
  `);
  console.log('[weekly-analytics-digest] vault secret updated');
} else {
  await runSql(`
    select vault.create_secret(
      '${FN_URL.replace(/'/g, "''")}',
      'weekly_analytics_digest_url',
      'weekly-analytics-digest Edge Function URL'
    );
  `);
  console.log('[weekly-analytics-digest] vault secret created');
}

const cron = await runSql(`
  select jobname, schedule, command
  from cron.job
  where jobname = 'weekly-analytics-digest';
`);
console.log('[weekly-analytics-digest] cron job:', JSON.stringify(cron, null, 2));

const tableInfo = await runSql(`
  select count(*)::int as rows
  from public.analytics_digest_log;
`);
console.log('[weekly-analytics-digest] analytics_digest_log rows:', JSON.stringify(tableInfo));

console.log('[weekly-analytics-digest] DONE.');
console.log('');
console.log('Next steps (manual):');
console.log('  1. Deploy the Edge Function:');
console.log('       supabase functions deploy weekly-analytics-digest --project-ref', PROJECT_REF);
console.log('  2. Smoke test (replay against FOISORUL A):');
console.log(
  `       curl -X POST ${FN_URL} \\\n         -H 'x-hir-notify-secret: <HIR_NOTIFY_SECRET>' \\\n         -H 'content-type: application/json' \\\n         -d '{"tenant_id":"<foisorul-a-uuid>","week_start":"<YYYY-MM-DD>","force":true}'`,
);
