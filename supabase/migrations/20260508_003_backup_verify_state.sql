-- Lane BACKUP-DR-AUDIT (2026-05-08) — state table for the
-- backup-verify-daily Edge Function. Singleton row (id='singleton') so
-- the function can do a simple PostgREST upsert and de-dupe Telegram
-- spam across daily runs.
--
-- Read access: service_role only (function reads + writes via
-- SUPABASE_SERVICE_ROLE_KEY). RLS denies anon/authenticated entirely.
-- Fully additive + idempotent.

create table if not exists public.backup_verify_state (
  id               text primary key default 'singleton'
                     check (id = 'singleton'),
  last_kind        text,
  last_checked_at  timestamptz,
  last_alerted_at  timestamptz
);

comment on table public.backup_verify_state is
  'Lane BACKUP-DR-AUDIT 2026-05-08 — singleton row tracking the most recent verdict from the backup-verify-daily Edge Function. Used to de-dupe Telegram alerts across daily runs.';

alter table public.backup_verify_state enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policies for authenticated or anon.
-- The Edge Function reads + writes via service_role which bypasses RLS.
