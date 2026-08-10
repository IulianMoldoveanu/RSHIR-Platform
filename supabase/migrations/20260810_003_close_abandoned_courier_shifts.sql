-- 20260810_003_close_abandoned_courier_shifts.sql
-- ⚠️ REVIEW-READY — apply to prod via the Supabase Management API.
--
-- Nothing ever ends a courier shift that was never ended. The Google Play
-- reviewer's shift went ONLINE on 2026-07-27 and was still ONLINE two weeks
-- later, last heartbeat 15 hours old.
--
-- That single row makes online_no_ping permanently non-zero, which makes
-- anomaly_detected permanently true in courier.healthMonitor. A monitor that
-- is always firing is a monitor nobody reads — and it would have buried the
-- two alarms added in 20260809_001 and 20260810_002 the day they shipped.
--
-- Ends shifts whose last sign of life is older than p_silent_hours (default 8).
-- Eight hours is longer than any real shift gap — a courier in a tunnel, on a
-- dead battery, or on a lunch break is nowhere near it — so this can never log
-- out somebody who is actually working. It is deliberately not the monitor's
-- 5-minute reachability threshold: "not reachable right now" and "this shift
-- was abandoned" are different questions with different answers.
--
-- ended_at is set to the last known activity, not now(). Backdating keeps
-- rollup_courier_daily_kpis from billing phantom hours for a shift that
-- stopped reporting days ago.
--
-- Idempotent: create or replace + unschedule-then-schedule.

begin;

create or replace function public.fn_close_abandoned_courier_shifts(
  p_silent_hours integer default 8
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_closed integer;
begin
  if p_silent_hours is null or p_silent_hours < 1 or p_silent_hours > 168 then
    raise exception 'fn_close_abandoned_courier_shifts: p_silent_hours must be between 1 and 168, got %',
      p_silent_hours;
  end if;

  with abandoned as (
    select cs.id, coalesce(cs.last_seen_at, cs.started_at) as last_alive
      from public.courier_shifts cs
     where cs.status = 'ONLINE'
       and cs.ended_at is null
       and coalesce(cs.last_seen_at, cs.started_at) < now() - make_interval(hours => p_silent_hours)
  )
  update public.courier_shifts cs
     set status   = 'OFFLINE',
         ended_at = a.last_alive
    from abandoned a
   where cs.id = a.id;

  get diagnostics v_closed = row_count;
  return v_closed;
end;
$$;

comment on function public.fn_close_abandoned_courier_shifts(integer) is
  'Ends ONLINE courier shifts whose last heartbeat is older than p_silent_hours '
  '(default 8), backdating ended_at to the last known activity so daily KPIs do '
  'not count phantom hours. Without this an abandoned shift keeps online_no_ping '
  'non-zero forever and courier.healthMonitor never stops reporting an anomaly.';

revoke all on function public.fn_close_abandoned_courier_shifts(integer) from public;
revoke all on function public.fn_close_abandoned_courier_shifts(integer) from anon;
revoke all on function public.fn_close_abandoned_courier_shifts(integer) from authenticated;

commit;

-- Hourly is plenty: this is housekeeping, and the monitor's own 5-minute
-- reachability signal is what covers the short term.
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'courier-close-abandoned-shifts';
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  perform cron.schedule(
    'courier-close-abandoned-shifts',
    '25 * * * *',
    $cron$ select public.fn_close_abandoned_courier_shifts(); $cron$
  );
end$$;
