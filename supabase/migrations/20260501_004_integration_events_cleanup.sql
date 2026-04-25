-- HIR Restaurant Suite — RSHIR-55
-- Cleanup job for integration_events: delete rows where status='SENT' and
-- sent_at < now() - interval '90 days'. Without this the table grows
-- unbounded; for a tenant doing ~500 orders/day each fanning out to one
-- adapter, that's ~45k rows/quarter. SENT rows are no longer useful past
-- the 90-day audit window (audit_log keeps the action trail).
--
-- DEAD rows are kept indefinitely so the operator can post-mortem failed
-- adapter runs without time pressure.
--
-- Idempotent: safe to re-apply.

create or replace function public.cleanup_integration_events()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count int;
begin
  with d as (
    delete from public.integration_events
     where status = 'SENT'
       and sent_at is not null
       and sent_at < now() - interval '90 days'
    returning 1
  )
  select count(*) into deleted_count from d;
  return deleted_count;
end;
$$;

do $$
declare
  job_id int;
begin
  select jobid into job_id from cron.job where jobname = 'integration-events-cleanup';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;

  perform cron.schedule(
    'integration-events-cleanup',
    '15 3 * * *',  -- daily at 03:15 UTC (after reminder cron at 03:00)
    $clean$select public.cleanup_integration_events();$clean$
  );
end $$;
