-- Fix courier-health-monitor cron — has been 100% failing since deploy
-- (288/288 fails in 24h).
--
-- Two bugs in 20260612_001_courier_health_monitor.sql:
--   1. INSERT writes a value to function_runs.duration_ms which has been
--      GENERATED ALWAYS AS (computed from ended_at - started_at) since
--      20260506_003_function_runs_observability.sql. Postgres rejects.
--   2. The cron emits status='success' / 'warning' but the check
--      constraint allows only ('RUNNING','SUCCESS','ERROR'). The
--      duration_ms error surfaces first; once that's fixed the status
--      one would surface next.
--
-- This migration unschedules the broken job and re-schedules a corrected
-- body. Health checks resume on the next */5 tick.

select cron.unschedule('courier-health-monitor');

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
      (function_name, started_at, ended_at, status, metadata)
    select
      'courier.healthMonitor',
      now(),
      now(),
      'SUCCESS',
      jsonb_build_object(
        'stuck_picked_up', stuck_picked_up,
        'online_no_ping', online_no_ping,
        'null_tenant_audit', null_tenant_audit,
        'threshold_stuck_minutes', 60,
        'threshold_offline_minutes', 5,
        'anomaly_detected',
          (stuck_picked_up > 0 or online_no_ping > 0 or null_tenant_audit > 0)
      )
    from counts;
  $$
);

comment on extension pg_cron is
  'courier-health-monitor re-scheduled by 20260620_002 with: '
  '(a) duration_ms removed from INSERT (it is a generated column), '
  '(b) status always SUCCESS since the run itself succeeded; anomaly flag '
  'lives in metadata.anomaly_detected for dashboard consumers.';
