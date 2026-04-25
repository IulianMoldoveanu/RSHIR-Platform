-- RSHIR-20: 24h TTL sweep for the menu-imports private bucket.
--
-- Source PDFs/images are only needed long enough for Claude Vision to extract
-- the menu rows and the operator to commit them; after that they are PII-light
-- but still operationally pointless to retain. We schedule a daily pg_cron job
-- that removes objects older than 24h. Deleting from `storage.objects` is the
-- canonical Supabase pattern — the storage extension's row-level trigger
-- propagates the delete to the underlying object store.
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
  -- or UTC+3 (summer). Splitting the difference at 01:00 UTC lands the sweep
  -- in the early-morning quiet window year-round.
  '0 1 * * *',
  $$
    delete from storage.objects
    where bucket_id = 'menu-imports'
      and created_at < now() - interval '24 hours';
  $$
);
