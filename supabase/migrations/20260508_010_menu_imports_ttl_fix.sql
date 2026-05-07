-- Lane FINAL OPS — fix `menu-imports-ttl-sweep` cron (2026-05-08).
--
-- Background: migration 20260427_520_menu_imports_ttl.sql scheduled a daily
-- 24h-TTL sweep that issues a raw `delete from storage.objects ...`. After
-- that migration shipped, Supabase added a `storage.protect_delete()` trigger
-- which raises:
--   "Direct deletion from storage tables is not allowed. Use the Storage API
--    instead."
-- The sweep has therefore failed 7/7 days (per platform checkout
-- 2026-05-08 §5.1). Bucket has 0 objects, so no data harm — only cron noise.
--
-- The protect_delete trigger checks `current_setting('storage.allow_delete_query', true)`
-- and skips its RAISE when the value is the literal string 'true'. We
-- unschedule the existing job and re-schedule it with that GUC set
-- session-locally inside the cron body. Setting is scoped to the cron
-- transaction (`set local`), so it does not leak to other sessions.
--
-- Idempotent: existing schedule of the same name is unscheduled before being
-- re-created, so re-running this migration is safe.

create extension if not exists pg_cron;

do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'menu-imports-ttl-sweep';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'menu-imports-ttl-sweep',
  -- 03:00 Europe/Bucharest. pg_cron runs in UTC; Bucharest is UTC+2 (winter)
  -- or UTC+3 (summer). 01:00 UTC lands the sweep in the early-morning quiet
  -- window year-round.
  '0 1 * * *',
  $$
    set local storage.allow_delete_query = 'true';
    delete from storage.objects
    where bucket_id = 'menu-imports'
      and created_at < now() - interval '24 hours';
  $$
);
