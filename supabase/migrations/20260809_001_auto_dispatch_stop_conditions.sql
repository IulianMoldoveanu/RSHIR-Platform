-- 20260809_001_auto_dispatch_stop_conditions.sql
-- ⚠️ REVIEW-READY — apply to prod via the Supabase Management API. Merging this
-- file does NOT auto-apply it (this repo applies migrations manually).
--
-- INCIDENT 2026-08-09. The Google Play reviewer account was receiving delivery
-- offers in the HIR Curier app. Two orphaned test rows in courier_orders
-- (created 2026-08-05, source_tenant_id NULL, parent restaurant_order gone,
-- customer "Ion" / +40712345678) had been offered, expired, revoked and
-- re-offered once a minute for four days.
--
-- The rows are cancelled already. This fixes why it could not stop on its own.
--
-- fn_auto_dispatch_sweep (20260630_038) and revoke_expired_courier_offers form
-- a deliberate loop: an un-accepted offer reverts to CREATED so a non-responsive
-- courier self-heals and the next sweep re-offers. What it never had is a
-- TERMINATION CONDITION. Nothing about "this order has been refused by everyone
-- for four days" stops the sweep picking it up again 60 seconds later, so any
-- order nobody will take becomes a permanent every-minute notification to
-- whoever is online. That is not specific to test data — a real order to an
-- address couriers keep declining behaves exactly the same way.
--
-- Three changes:
--
--   1. AGE CUT-OFF. Stop auto-offering an order that has been waiting longer
--      than p_max_age_minutes (default 180). Measuring from courier_orders
--      .created_at is the right clock: the bidi-sync trigger only inserts the
--      row when restaurant_orders.status becomes DISPATCHED, so created_at is
--      "ready and waiting for a courier", not when the customer ordered. A
--      pre-order placed hours ahead is therefore unaffected — it does not exist
--      in this table until it is out of the kitchen.
--
--      Aged-out orders are NOT cancelled and NOT hidden. They stay CREATED in
--      the open pool, so the fleet-wide broadcast and the dispatcher's manual
--      Auto-Assign still reach them. The only thing that stops is the automated
--      pinging. This keeps the original "never worse than today" property:
--      before auto-dispatch existed, allocation was manual anyway.
--
--   2. ORPHAN GUARD. Skip source_type = 'HIR_TENANT' rows whose
--      source_tenant_id is NULL. That combination is self-contradictory — a
--      tenant order with no tenant — and it is exactly the shape both incident
--      rows had. Such a row cannot be reconciled, invoiced or traced back to a
--      restaurant, so it has no business being pushed at a courier. Other
--      source types are untouched: only HIR_TENANT promises a tenant.
--
--   3. AN ALARM, so the cut-off does not trade a loud failure for a silent one.
--      courier-health-monitor watched PICKED_UP-too-long, online-without-ping
--      and null-tenant audit rows, but nothing watched the open pool. An order
--      that ages out would have rotted there unnoticed. It now reports
--      stuck_created (CREATED, unassigned, older than 180 minutes) and counts
--      it towards anomaly_detected, which is what pages Hepi.
--
-- Idempotent: create or replace, and unschedule-then-schedule for the cron.

begin;

create or replace function public.fn_auto_dispatch_sweep(
  p_timeout_seconds  integer default 90,
  p_max_age_minutes  integer default 180
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order   record;
  v_winner  uuid;
  v_offered integer := 0;
  v_result  jsonb;
begin
  -- Provably inert when the feature is off everywhere: a single cheap EXISTS check
  -- per cron tick when no fleet has opted in.
  if not exists (select 1 from public.courier_fleets where auto_dispatch_enabled) then
    return 0;
  end if;

  -- A non-positive or absurd cut-off would silently restore the old
  -- offer-forever behaviour, so refuse it rather than guess.
  if p_max_age_minutes is null or p_max_age_minutes < 1 or p_max_age_minutes > 10080 then
    raise exception 'fn_auto_dispatch_sweep: p_max_age_minutes must be between 1 and 10080, got %',
      p_max_age_minutes;
  end if;

  for v_order in
    select co.id, co.fleet_id, co.pickup_lat, co.pickup_lng
      from public.courier_orders co
      join public.courier_fleets f on f.id = co.fleet_id
     where co.status = 'CREATED'
       and co.assigned_courier_user_id is null
       and f.auto_dispatch_enabled
       -- (1) give up on orders nobody has taken; a human owns them from here
       and co.created_at > now() - make_interval(mins => p_max_age_minutes)
       -- (2) a tenant order with no tenant is malformed — never dispatch it
       and not (co.source_type = 'HIR_TENANT' and co.source_tenant_id is null)
     order by co.created_at asc
     limit 50  -- bound the work per tick; the rest are picked up next minute
  loop
    select cand.user_id
      into v_winner
      from (
        select cp.user_id,
               (select count(*)
                  from public.courier_orders a
                 where a.assigned_courier_user_id = cp.user_id
                   and a.status in ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT')) as active_load,
               sh.last_lat,
               sh.last_lng
          from public.courier_profiles cp
          join lateral (
            select cs.last_lat, cs.last_lng
              from public.courier_shifts cs
             where cs.courier_user_id = cp.user_id
               and cs.status = 'ONLINE'
             order by cs.started_at desc
             limit 1
          ) sh on true
         where cp.fleet_id = v_order.fleet_id
           and cp.status = 'ACTIVE'  -- offer_courier_order requires ACTIVE-in-fleet
           -- Don't stack a second offer on a courier already holding a pending one.
           and not exists (
             select 1 from public.courier_orders o2
              where o2.assigned_courier_user_id = cp.user_id
                and o2.status = 'OFFERED'
           )
      ) cand
     order by
       -- weighted score DESC (mirrors scoreCandidates total: loadScore + distanceScore)
       ( round((5 - least(cand.active_load, 5))::numeric / 5 * 60)
         + case
             when v_order.pickup_lat is null or v_order.pickup_lng is null
               or cand.last_lat is null or cand.last_lng is null
             then 0
             else round((10 - least(
               6371.0 * 2 * asin(sqrt(
                 power(sin(radians(cand.last_lat - v_order.pickup_lat) / 2), 2)
                 + cos(radians(v_order.pickup_lat)) * cos(radians(cand.last_lat))
                   * power(sin(radians(cand.last_lng - v_order.pickup_lng) / 2), 2)
               )), 10))::numeric / 10 * 40)
           end
       ) desc,
       -- exact-tie fallback = original heuristic: load ASC, raw distance ASC, user_id
       cand.active_load asc,
       ( case
           when v_order.pickup_lat is null or v_order.pickup_lng is null
             or cand.last_lat is null or cand.last_lng is null
           then 'Infinity'::float8
           else 6371000.0 * 2 * asin(sqrt(
             power(sin(radians(cand.last_lat - v_order.pickup_lat) / 2), 2)
             + cos(radians(v_order.pickup_lat)) * cos(radians(cand.last_lat))
               * power(sin(radians(cand.last_lng - v_order.pickup_lng) / 2), 2)
           ))
         end
       ) asc,
       cand.user_id asc
     limit 1;

    if v_winner is not null then
      -- Atomic CREATED → OFFERED; loses gracefully if the order was grabbed meanwhile.
      v_result := public.offer_courier_order(v_order.id, v_winner, v_order.fleet_id, p_timeout_seconds);
      if coalesce((v_result ->> 'offered')::boolean, false) then
        v_offered := v_offered + 1;
      end if;
    end if;
  end loop;

  return v_offered;
end;
$$;

comment on function public.fn_auto_dispatch_sweep(integer, integer) is
  'Fleet-level auto-dispatch: OFFERS each open-pool order in an auto_dispatch_enabled '
  'fleet to the nearest available online courier (mirrors auto-assign-score.ts). '
  'Inert unless a fleet opts in. Runs every minute via pg_cron; non-accepted offers '
  'revert via revoke_expired_courier_offers(). Gives up after p_max_age_minutes '
  '(default 180) so an order nobody accepts stops being re-offered forever, and '
  'never dispatches a HIR_TENANT row with no source_tenant_id.';

revoke all on function public.fn_auto_dispatch_sweep(integer, integer) from public;
revoke all on function public.fn_auto_dispatch_sweep(integer, integer) from anon;
revoke all on function public.fn_auto_dispatch_sweep(integer, integer) from authenticated;

-- The old single-argument signature stays resolvable (the cron calls it with no
-- args, and PG keeps overloads separate), but leaving it in place would mean two
-- copies of this logic drifting apart. Drop it; the new default covers the only
-- call site.
drop function if exists public.fn_auto_dispatch_sweep(integer);

commit;

-- Re-point the cron at the surviving signature. Same schedule, same behaviour
-- for healthy orders.
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'auto-dispatch-sweep';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
  perform cron.schedule(
    'auto-dispatch-sweep',
    '* * * * *',
    $cron$ select public.fn_auto_dispatch_sweep(); $cron$
  );
end$$;

-- (3) Watch the open pool. Adds stuck_created to the existing health monitor
-- rather than a new job, so there is still one courier health signal.
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'courier-health-monitor';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
  perform cron.schedule(
    'courier-health-monitor',
    '*/5 * * * *',
    $cron$
    with
      stuck as (
        select count(*) as n
        from public.courier_orders
        where status = 'PICKED_UP'
          and updated_at < now() - interval '60 minutes'
      ),
      stuck_open as (
        select count(*) as n
        from public.courier_orders
        where status = 'CREATED'
          and assigned_courier_user_id is null
          and created_at < now() - interval '180 minutes'
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
               stuck_open.n as stuck_created,
               offline_ping.n as online_no_ping,
               null_tenant.n as null_tenant_audit
        from stuck, stuck_open, offline_ping, null_tenant
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
        'stuck_created', stuck_created,
        'online_no_ping', online_no_ping,
        'null_tenant_audit', null_tenant_audit,
        'threshold_stuck_minutes', 60,
        'threshold_created_minutes', 180,
        'threshold_offline_minutes', 5,
        'anomaly_detected',
          (stuck_picked_up > 0 or stuck_created > 0 or online_no_ping > 0 or null_tenant_audit > 0)
      )
    from counts;
    $cron$
  );
end$$;
