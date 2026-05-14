-- HIR Courier — health-monitor cron
--
-- Periodically scans the courier surface for the three anomalies the F6
-- observability plan flags as P0:
--   1. Orders stuck in PICKED_UP for > 60 minutes with no follow-up
--      transition (rider phone died / forgot / vendor cancelled out-of-band).
--   2. Couriers reported ONLINE but whose last GPS ping is older than
--      5 minutes (location-tracker offline / app crashed / signal lost
--      AND offline-queue not yet drained).
--   3. audit_log rows from the last 24h with tenant_id NULL — would have
--      caught the pre-PR-#412 derivation bug in production within an hour
--      instead of waiting for someone to notice in the dashboard.
--
-- Each run emits one row into `public.function_runs`:
--   function_name = 'courier.healthMonitor'
--   status        = 'success' when all three counts are 0
--                   'warning' when any count > 0
--   metadata      = { stuck_picked_up, online_no_ping, null_tenant_audit }
--
-- No new table — we already have function_runs + the admin observability
-- dashboard renders 'warning' rows distinctly. Operator sees the breach
-- the next time they open /dashboard/admin/observability/function-runs.
--
-- Idempotent: schedule is unscheduled by name before being re-created.

create extension if not exists pg_cron;

do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'courier-health-monitor';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

-- Every 5 minutes. Same cadence the offline-ping anomaly is measured at,
-- so the scan is never older than the threshold it's checking. The cron
-- runs in the same Postgres instance that owns the data — single
-- transactional snapshot, no race against ongoing transitions.
select cron.schedule(
  'courier-health-monitor',
  '*/5 * * * *',
  $$
    with
      stuck as (
        select count(*) as n
        from public.courier_orders
        where status = 'PICKED_UP'
          and updated_at < now() - interval '60 minutes'
      ),
      offline_ping as (
        select count(*) as n
        from public.courier_shifts
        where status = 'ONLINE'
          and (last_seen_at is null or last_seen_at < now() - interval '5 minutes')
      ),
      null_tenant as (
        select count(*) as n
        from public.audit_log
        where created_at > now() - interval '24 hours'
          and tenant_id is null
      ),
      counts as (
        select stuck.n as stuck_picked_up,
               offline_ping.n as online_no_ping,
               null_tenant.n as null_tenant_audit
        from stuck, offline_ping, null_tenant
      )
    insert into public.function_runs
      (function_name, started_at, ended_at, duration_ms, status, metadata)
    select
      'courier.healthMonitor',
      now(),
      now(),
      0,
      case
        when stuck_picked_up > 0
          or online_no_ping > 0
          or null_tenant_audit > 0
        then 'warning'
        else 'success'
      end,
      jsonb_build_object(
        'stuck_picked_up', stuck_picked_up,
        'online_no_ping', online_no_ping,
        'null_tenant_audit', null_tenant_audit,
        'threshold_stuck_minutes', 60,
        'threshold_offline_minutes', 5
      )
    from counts;
  $$
);
