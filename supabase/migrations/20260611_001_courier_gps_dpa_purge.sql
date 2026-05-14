-- HIR Courier — DPA 30-day GPS retention purge
--
-- DPA-TEMPLATE-2026-05-13.md locks courier location data to 30-day
-- retention: GPS pings, last_seen positions, and any other personal
-- location derivative may not persist beyond 30 days after the shift
-- ended. Earnings data (started_at, ended_at, totals) is allowed to
-- stay for fiscal/payroll reporting — we only scrub the PII GPS
-- columns, not the shift row itself.
--
-- Scope of this migration:
--   1. Daily pg_cron job that NULLs `courier_shifts.last_lat / last_lng /
--      last_seen_at` for OFFLINE rows whose `ended_at` is older than
--      30 days. Idempotent: rows already NULL on all three are
--      skipped via the WHERE predicate.
--   2. Does NOT delete courier_orders.pickup_*/dropoff_* — those are
--      order-operational coordinates (route, dispute resolution, fleet
--      analytics), not personal courier location data. They live on
--      the audit-log + finance-agent retention policy for orders.
--
-- Idempotent: the schedule is unscheduled by name before being
-- re-created, so re-running this migration is safe.

create extension if not exists pg_cron;

do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'courier-gps-dpa-30day-purge';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

-- Run daily at 02:30 UTC — same low-traffic window as menu-imports
-- TTL (01:00) and other housekeeping crons. 02:30 lets the earlier
-- sweep finish before this one starts.
select cron.schedule(
  'courier-gps-dpa-30day-purge',
  '30 2 * * *',
  $$
    update public.courier_shifts
       set last_lat = null,
           last_lng = null,
           last_seen_at = null
     where status = 'OFFLINE'
       and ended_at < now() - interval '30 days'
       and (
         last_lat is not null
         or last_lng is not null
         or last_seen_at is not null
       );
  $$
);

-- ============================================================
-- Test seed helper (for documentation; NOT executed by the migration).
-- Operator can run interactively to verify the cron purges as expected:
--
--   insert into public.courier_shifts (courier_user_id, started_at,
--     ended_at, status, last_lat, last_lng, last_seen_at)
--   values (
--     '<test_user_id>',
--     now() - interval '40 days',
--     now() - interval '39 days',
--     'OFFLINE',
--     45.6427, 25.5887, now() - interval '39 days'
--   );
--
--   -- Wait for next 02:30 UTC cron run, then verify:
--   select last_lat, last_lng, last_seen_at
--     from public.courier_shifts
--    where courier_user_id = '<test_user_id>'
--      and ended_at < now() - interval '30 days';
--   -- Expect: all three columns NULL.
-- ============================================================
