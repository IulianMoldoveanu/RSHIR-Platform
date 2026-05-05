// Manual run only — Iulian sign-off required for backfill + cron.
//
// Lane S — Audit log chain hardening, staged activation script.
//
// What this script does (when invoked manually):
//   1. Applies the additive migration 20260605_003_audit_log_chain_hardening.sql
//      via the Supabase Mgmt API. Schema is additive (nullable columns + trigger
//      + helper fns + tracking table + a verifier function), so existing rows
//      are not touched.
//   2. PRINTS — but does NOT execute — the SQL needed to backfill existing rows.
//      Backfill is a one-shot mass mutation; Iulian must run it deliberately
//      and only after confirming with the Chief.
//   3. PRINTS — but does NOT execute — the pg_cron schedule SQL for periodic
//      automatic verification (per-day full-range run). Activate only after
//      Iulian agrees.
//
// Invocation:
//   node "C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-chief/scripts/post-merge/setup-audit-chain.mjs"
//
// Safety:
//   - Requires explicit env override APPLY=1 to actually run the migration.
//   - Without APPLY=1 it does a DRY RUN: prints what it would do and exits.
//   - NEVER runs the backfill or the cron — those are printed only.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const VAULT_PATH = 'C:/Users/Office HIR CEO/.hir/secrets.json';
const v = JSON.parse(readFileSync(VAULT_PATH, 'utf8'));
const SUPABASE_REF = v.supabase.project_ref;
const SUPABASE_PAT = v.supabase.management_pat;

// Path resolution — the script is committed to whichever clone runs it.
// We resolve relative to the file URL so it works from any worktree on any
// OS. Earlier draft used `pathname.replace(/^\//, '')` which on POSIX
// turned `/workspace/...` into `workspace/...` (Codex P2, 2026-05-05).
// fileURLToPath is the canonical Node API for this conversion.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const migrationPath = resolve(
  repoRoot,
  'supabase',
  'migrations',
  '20260605_003_audit_log_chain_hardening.sql',
);

const sql = readFileSync(migrationPath, 'utf8');

const APPLY = process.env.APPLY === '1';

console.log('==========================================================');
console.log('Lane S — Audit chain hardening setup');
console.log('==========================================================');
console.log(`Mode:        ${APPLY ? 'APPLY (will hit Mgmt API)' : 'DRY RUN (no DB writes)'}`);
console.log(`Project ref: ${SUPABASE_REF}`);
console.log(`Migration:   ${migrationPath}`);
console.log(`SQL bytes:   ${sql.length}`);
console.log('==========================================================');

if (APPLY) {
  console.log('\n[1/1] Applying migration via Mgmt API...');
  const r = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + SUPABASE_PAT,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  console.log('  status:', r.status, r.ok ? 'OK' : 'FAILED');
  if (!r.ok) {
    console.error('  body:', text);
    process.exit(1);
  }
  console.log('  Migration applied. Trigger active for NEW inserts only.');
} else {
  console.log('\n(skipping migration apply — set APPLY=1 to run it)');
}

console.log('\n----------------------------------------------------------');
console.log('NEXT STEPS — Iulian sign-off required before running:');
console.log('----------------------------------------------------------');

console.log('\n[A] BACKFILL existing audit_log rows (one-shot, mass mutation):');
console.log('--------------------------------------------------------------');
console.log(`-- Computes prev_hash + row_hash for every existing row, in
-- chronological order. Locks the table briefly. Re-runs are no-ops
-- once row_hash is non-NULL, but you should still run this only once.

do $backfill$
declare
  r          record;
  v_prev     text := null;
  v_payload  text;
  v_hash     text;
begin
  for r in
    select id, tenant_id, actor_user_id, action, entity_type, entity_id,
           metadata, created_at, row_hash
    from public.audit_log
    order by created_at asc, id asc
    for update
  loop
    -- Skip if already hashed (idempotency).
    if r.row_hash is not null then
      v_prev := r.row_hash;
      continue;
    end if;
    v_payload := public.audit_log_canonical_payload(
      r.id, r.tenant_id, r.actor_user_id, r.action,
      r.entity_type, r.entity_id, r.metadata, r.created_at
    );
    v_hash := encode(
      digest(coalesce(v_prev, '') || '||' || v_payload, 'sha256'),
      'hex'
    );
    update public.audit_log
       set prev_hash = v_prev,
           row_hash  = v_hash
     where id = r.id;
    v_prev := v_hash;
  end loop;
end
$backfill$;`);

console.log('\n[B] PG_CRON daily verification (requires pg_cron extension):');
console.log('--------------------------------------------------------------');
console.log(`-- Once per day, run a full-range chain verification and store the
-- result in audit_log_verifier_runs. Telegram alerts are NOT fired by this
-- cron (the API route fires them); add an alert path here only after the
-- audit-integrity-alert edge function is configured with the
-- AUDIT_INTEGRITY_ALERT_TOKEN secret.

create extension if not exists pg_cron;

select cron.schedule(
  'audit_log_chain_daily_verify',
  '17 3 * * *',  -- 03:17 UTC daily
  $cron$
  with v as (
    select count(*) as mismatches
    from public.audit_log_verify_chain(null, null)
  )
  insert into public.audit_log_verifier_runs
    (started_at, finished_at, range_start, range_end, mismatches, triggered_by)
  select now(), now(), null, null, mismatches, 'cron'
  from v;
  $cron$
);`);

console.log('\n----------------------------------------------------------');
console.log('Done. Review output, ping Iulian, run [A] then [B] manually.');
console.log('----------------------------------------------------------');
