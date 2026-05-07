// Post-merge bootstrap for Lane EVENTS-SIGNAL-INGESTION (2026-05-08).
// 1. Applies 20260508_002_city_events.sql (additive, idempotent).
// 2. Seeds two vault entries used by pg_cron:
//      - events_snapshot_url    (Edge Function URL)
//      - events_cron_token      (random 32-byte hex; written to fn secret too)
// 3. Surfaces the Iulian-action: writing each upstream API key to vault is
//    operator-only — script intentionally does NOT do that. The fn returns
//    API_KEY_MISSING_<SRC> per source until those steps happen.
//
// Usage:
//   node scripts/post-merge/setup-events-snapshot.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const VAULT_PATH = 'C:/Users/Office HIR CEO/.hir/secrets.json';
const v = JSON.parse(readFileSync(VAULT_PATH, 'utf8'));
const SUPABASE_REF = v.supabase.project_ref;
const SUPABASE_PAT = v.supabase.management_pat;

const FUNCTION_URL = `https://${SUPABASE_REF}.functions.supabase.co/events-snapshot`;

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(here, '..', '..', 'supabase', 'migrations', '20260508_002_city_events.sql');
const sql = readFileSync(sqlPath, 'utf8');

console.log('[events-snapshot] applying migration:', sqlPath);
const apply = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + SUPABASE_PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
if (!apply.ok) {
  console.error('[events-snapshot] migration failed:', apply.status, await apply.text());
  process.exit(1);
}
console.log('[events-snapshot] migration applied: 200 OK');

const cronToken = process.env.EVENTS_CRON_TOKEN ?? randomBytes(32).toString('hex');

console.log('[events-snapshot] seeding vault: events_snapshot_url + events_cron_token');
const seedSql = `
  select public.hir_write_vault_secret('events_snapshot_url', '${FUNCTION_URL}', 'events-snapshot Edge Function URL');
  select public.hir_write_vault_secret('events_cron_token',  '${cronToken}', 'shared secret for X-Cron-Token between pg_cron and events-snapshot fn');
`;
const seed = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + SUPABASE_PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: seedSql }),
});
if (!seed.ok) {
  console.error('[events-snapshot] vault seed failed:', seed.status, await seed.text());
  process.exit(1);
}
console.log('[events-snapshot] vault seeded.');

console.log('');
console.log('[events-snapshot] DONE. Iulian-action remaining (free-tier signups, ~15 min total):');
console.log('  1. Eventbrite — https://www.eventbrite.com/platform/api-keys/ (free, OAuth or private token).');
console.log('       SQL: select public.hir_write_vault_secret(');
console.log("              \'eventbrite_api_token\',\'<TOKEN>\',\'Eventbrite Public Events API token\');");
console.log('');
console.log('  2. TicketMaster — https://developer.ticketmaster.com/ (free, register app).');
console.log('       SQL: select public.hir_write_vault_secret(');
console.log("              \'ticketmaster_api_key\',\'<KEY>\',\'TicketMaster Discovery API key\');");
console.log('');
console.log('  3. Google Places — https://console.cloud.google.com/apis/credentials (free $200/mo credit).');
console.log('       Enable: Places API + Places API (New). Restrict the key to those two APIs.');
console.log('       SQL: select public.hir_write_vault_secret(');
console.log("              \'google_places_api_key\',\'<KEY>\',\'Google Places API key (Text Search)\');");
console.log('');
console.log('  4. Set Edge Function env EVENTS_CRON_TOKEN to the value just generated:');
console.log('       ' + cronToken);
console.log('');
console.log('  5. Deploy the Edge Function:');
console.log('       node supabase/deploy-function.mjs events-snapshot --verify-jwt=false');
console.log('');
console.log('Until step 1-3 complete, the cron job runs daily at 04:07 UTC and the fn returns');
console.log('API_KEY_MISSING_<SRC> per missing source (logged as SUCCESS). Manual feed via');
console.log('/dashboard/admin/cities/events works regardless.');
