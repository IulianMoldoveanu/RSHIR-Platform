-- medical_access_logs 5-year retention purge.
--
-- DPA-TEMPLATE-2026-05-13.md states pharma access logs are retained for
-- 5 years from the date of access. This cron purges rows older than
-- that threshold weekly. Weekly (not daily) because:
--   - the table is append-only with no UPDATE pressure
--   - a one-week drift past the legal retention is well within any
--     reasonable compliance margin
--   - daily would re-scan the entire history index 7× without finding
--     anything new to delete for the first 5 years
--
-- Pattern mirrors the GPS purge cron from 20260611_001 — same Sunday
-- 02:30 UTC slot, just on a different table. Two safety nets:
--
--   1. Conservative threshold: NOW() - INTERVAL '5 years' is strictly
--      "older than 5y," so even with the cron firing at 02:30 the
--      window is never tighter than 5 years to the minute.
--
--   2. DELETE returns the count via RAISE NOTICE so a Supabase logs
--      audit can confirm activity (or lack of it) without a separate
--      observability row.

create extension if not exists pg_cron;

-- Drop existing job if re-running this migration (idempotent).
do $$
declare j bigint;
begin
  select jobid into j from cron.job where jobname = 'medical-access-logs-5y-purge';
  if j is not null then perform cron.unschedule(j); end if;
end$$;

select cron.schedule(
  'medical-access-logs-5y-purge',
  '30 2 * * 0',
  $$
    do $cron$
    declare deleted int;
    begin
      delete from public.medical_access_logs
      where accessed_at < now() - interval '5 years';
      get diagnostics deleted = row_count;
      raise notice 'medical_access_logs purge: % rows deleted (older than 5 years)', deleted;
    end
    $cron$;
  $$
);

comment on extension pg_cron is
  'Scheduled jobs runtime. Used by: GPS purge (jobname courier-gps-dpa-30day-purge), health monitor (courier-health-monitor), medical_access_logs purge (medical-access-logs-5y-purge).';
