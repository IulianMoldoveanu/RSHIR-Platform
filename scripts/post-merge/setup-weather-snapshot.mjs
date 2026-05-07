// Post-merge bootstrap for Lane WEATHER-SIGNAL-INGESTION (2026-05-08).
// 1. Applies 20260508_001_weather_snapshots.sql (additive, idempotent).
// 2. Seeds two vault entries used by pg_cron:
//      - weather_snapshot_url    (Edge Function URL)
//      - weather_cron_token      (random 32-byte hex; written to fn secret too)
// 3. Surfaces the Iulian-action: writing `openweathermap_api_key` to vault
//    is operator-only — script intentionally does NOT do this. The fn
//    returns `API_KEY_MISSING` until that step happens.
//
// Usage:
//   node "C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-weather/scripts/post-merge/setup-weather-snapshot.mjs"

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const VAULT_PATH = 'C:/Users/Office HIR CEO/.hir/secrets.json';
const v = JSON.parse(readFileSync(VAULT_PATH, 'utf8'));
const SUPABASE_REF = v.supabase.project_ref;
const SUPABASE_PAT = v.supabase.management_pat;

const FUNCTION_URL = `https://${SUPABASE_REF}.functions.supabase.co/weather-snapshot`;

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(here, '..', '..', 'supabase', 'migrations', '20260508_001_weather_snapshots.sql');
const sql = readFileSync(sqlPath, 'utf8');

console.log('[weather-snapshot] applying migration:', sqlPath);
const apply = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + SUPABASE_PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
if (!apply.ok) {
  console.error('[weather-snapshot] migration failed:', apply.status, await apply.text());
  process.exit(1);
}
console.log('[weather-snapshot] migration applied: 200 OK');

// Generate cron token if not provided via env. Same secret goes to BOTH the
// vault (read by pg_cron) and the Edge Function env (read at request time).
const cronToken = process.env.WEATHER_CRON_TOKEN ?? randomBytes(32).toString('hex');

console.log('[weather-snapshot] seeding vault: weather_snapshot_url + weather_cron_token');
const seedSql = `
  select public.hir_write_vault_secret('weather_snapshot_url', '${FUNCTION_URL}', 'weather-snapshot Edge Function URL');
  select public.hir_write_vault_secret('weather_cron_token',  '${cronToken}', 'shared secret for X-Cron-Token between pg_cron and weather-snapshot fn');
`;
const seed = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + SUPABASE_PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: seedSql }),
});
if (!seed.ok) {
  console.error('[weather-snapshot] vault seed failed:', seed.status, await seed.text());
  process.exit(1);
}
console.log('[weather-snapshot] vault seeded.');

console.log('');
console.log('[weather-snapshot] DONE. Iulian-action remaining:');
console.log('  1. Sign up at https://openweathermap.org/api (free tier, no card).');
console.log('  2. Run the following SQL via Mgmt API or SQL Editor:');
console.log("       select public.hir_write_vault_secret('openweathermap_api_key','<KEY>','OpenWeatherMap free-tier API key');");
console.log('  3. Set Edge Function env WEATHER_CRON_TOKEN to the value just generated:');
console.log('       ' + cronToken);
console.log('  4. Deploy the Edge Function:');
console.log('       node supabase/deploy-function.mjs weather-snapshot --verify-jwt=false');
console.log('');
console.log('Until step 1+2 complete, the cron job runs every 6h and the fn returns API_KEY_MISSING (logged as SUCCESS).');
