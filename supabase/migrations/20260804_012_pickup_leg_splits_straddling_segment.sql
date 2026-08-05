-- Codex review (PR #1055, P2, round 2): the pickup leg discarded any segment
-- that straddled the pickup moment.
--
-- The filter was `t_end <= picked_up_at`, so a segment starting before pickup
-- and ending after it contributed nothing — and at ~30s sampling that is the
-- NORMAL case, not an edge one: pickup almost never lands exactly on a fix.
-- route_pickup_distance_m was therefore biased low by up to a full segment on
-- every order, and on a short approach with one fix before pickup and the next
-- just after it reported a flat 0 m beside a perfectly measured total. That
-- number is on the courier card, the fleet panel, and avg_pickup_distance_m in
-- the Command Center, where "couriers drive 0 m to reach vendors" would be a
-- believable-looking lie.
--
-- Fix: split a straddling segment by time, the same proportional reasoning the
-- concurrency midpoint already uses. `usable` guarantees t_end > t_start, so
-- the ratio is always well-defined and strictly between 0 and 1.

create or replace function public.fn_courier_order_route(p_order_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- 150 km/h. Above this a "movement" is a GPS teleport, not a scooter.
  c_max_speed_mps constant double precision := 41.7;

  v_courier   uuid;
  v_from      timestamptz;
  v_pickup_at timestamptz;
  v_to        timestamptz;

  v_segments   integer := 0;
  v_total      double precision := 0;
  v_pickup_leg double precision := 0;
  v_attributed double precision := 0;
begin
  select co.assigned_courier_user_id,
         co.accepted_at,
         co.picked_up_at,
         coalesce(co.delivered_at, co.cancelled_at, now())
    into v_courier, v_from, v_pickup_at, v_to
    from public.courier_orders co
   where co.id = p_order_id;

  -- Never accepted, or never assigned: there is no window to measure.
  if v_courier is null or v_from is null or v_to <= v_from then
    return jsonb_build_object(
      'points', 0,
      'distance_m', null,
      'pickup_distance_m', null,
      'attributed_distance_m', null
    );
  end if;

  with pts as (
    select clp.lat, clp.lng, clp.recorded_at
      from public.courier_location_pings clp
     where clp.courier_user_id = v_courier
       and clp.recorded_at >= v_from
       and clp.recorded_at <= v_to
  ),
  segs as (
    select p.recorded_at                                as t_end,
           lag(p.recorded_at) over w                    as t_start,
           public.fn_haversine_m(
             lag(p.lat) over w, lag(p.lng) over w, p.lat, p.lng
           )                                            as d
      from pts p
    window w as (order by p.recorded_at)
  ),
  usable as (
    select s.d,
           s.t_start,
           s.t_end,
           s.t_start + (s.t_end - s.t_start) / 2 as t_mid
      from segs s
     where s.t_start is not null
       and s.t_end > s.t_start
       -- Drop implausible jumps rather than let one bad fix add kilometres.
       and s.d / extract(epoch from (s.t_end - s.t_start)) <= c_max_speed_mps
  ),
  scored as (
    select u.d,
           u.t_start,
           u.t_end,
           -- How many of this courier's orders were open across this segment.
           -- Always >= 1: the order being measured is itself open here.
           greatest(1, (
             select count(*)
               from public.courier_orders o
              where o.assigned_courier_user_id = v_courier
                and o.accepted_at is not null
                and o.accepted_at <= u.t_mid
                and coalesce(o.delivered_at, o.cancelled_at, now()) >= u.t_mid
           )) as concurrency
      from usable u
  )
  select count(*),
         coalesce(sum(s.d), 0),
         coalesce(sum(
           case
             -- Never picked up (cancelled en route): every metre was approach.
             when v_pickup_at is null                then s.d
             when s.t_end   <= v_pickup_at           then s.d
             when s.t_start >= v_pickup_at           then 0
             -- Straddles pickup: credit the share driven before it.
             else s.d * (
               extract(epoch from (v_pickup_at - s.t_start))
               / extract(epoch from (s.t_end - s.t_start))
             )
           end
         ), 0),
         coalesce(sum(s.d / s.concurrency), 0)
    into v_segments, v_total, v_pickup_leg, v_attributed
    from scored s;

  -- No usable segment is not a short trip — it is no measurement at all.
  if v_segments < 1 then
    return jsonb_build_object(
      'points', 0,
      'distance_m', null,
      'pickup_distance_m', null,
      'attributed_distance_m', null
    );
  end if;

  return jsonb_build_object(
    -- Samples that actually contributed: n segments come from n+1 points.
    'points', v_segments + 1,
    'distance_m', round(v_total)::integer,
    'pickup_distance_m', round(v_pickup_leg)::integer,
    'attributed_distance_m', round(v_attributed)::integer
  );
end;
$$;

comment on column public.courier_orders.route_pickup_distance_m is
  'The leg of route_distance_m driven before pickup (accept -> picked_up_at). '
  'A segment straddling the pickup moment is split by time, so this is never '
  'biased low by the sampling interval. Dispatch-quality signal: how far '
  'couriers travel to reach the vendor.';
