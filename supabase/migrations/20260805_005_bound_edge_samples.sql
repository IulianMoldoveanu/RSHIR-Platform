-- Codex review (PR #1055, P2, round 9): the boundary samples could reach back
-- across an off-shift gap and charge the relocation to the first order.
--
-- 20260804_015 added a neighbouring sample on each side of the order window so
-- the segments straddling the edges could be prorated instead of dropped. Its
-- comment reassured that an old predecessor was safe because "proration divides
-- by the full segment duration, so a three-day-old previous fix contributes a
-- correspondingly tiny slice". That reasoning only checked the LONG gap. The
-- short one is where it bites:
--
--   Courier ends their shift, drives 10 km home, comes back 30 minutes later.
--   The cross-gap segment is 10 km over 1800 s — 20 km/h, sailing through the
--   150 km/h filter. If the new shift's first stored sample lands 5 minutes
--   after the first order is accepted, the overlap is 300/1800 of that segment:
--   about 1.7 km of driving that happened while off shift, charged to a
--   delivery that had not started.
--
-- The client reports at least every two minutes while on shift (HEARTBEAT_MS),
-- so a legitimate neighbour sits at most a couple of minutes outside the
-- window. A larger gap means the courier was not reporting at all — off shift,
-- GPS denied, app killed — and a straight line across that silence is fiction,
-- not interpolation. Five minutes gives the heartbeat a wide margin while
-- refusing to invent anything across a real absence.
--
-- A max-gap bound rather than a shift join: it subsumes the cross-shift case
-- (any break longer than five minutes is excluded anyway) and also covers gaps
-- WITHIN a shift, where the courier stayed online but stopped reporting.

create or replace function public.fn_courier_order_route(p_order_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- 150 km/h. Above this a "movement" is a GPS teleport, not a scooter.
  c_max_speed_mps   constant double precision := 41.7;
  -- Mirrors courier-location-trail-30day-purge (20260804_008).
  c_trail_retention constant interval := interval '30 days';
  -- How far outside the window an edge sample may sit and still describe
  -- continuous travel. Comfortably above the 2-minute client heartbeat.
  c_max_edge_gap    constant interval := interval '5 minutes';

  v_courier    uuid;
  v_from       timestamptz;
  v_pickup_at  timestamptz;
  v_to         timestamptz;
  v_pickup_end timestamptz;

  v_segments   integer := 0;
  v_total      double precision := 0;
  v_pickup_leg double precision := 0;
  v_attributed double precision := 0;

  c_unmeasured constant jsonb := jsonb_build_object(
    'points', 0,
    'distance_m', null,
    'pickup_distance_m', null,
    'attributed_distance_m', null
  );
begin
  select co.assigned_courier_user_id,
         public.fn_route_window_start(co.accepted_at, co.courier_assigned_at),
         co.picked_up_at,
         coalesce(co.delivered_at, co.cancelled_at, now())
    into v_courier, v_from, v_pickup_at, v_to
    from public.courier_orders co
   where co.id = p_order_id;

  if v_courier is null or v_from is null or v_to <= v_from then
    return c_unmeasured;
  end if;

  if v_from < now() - c_trail_retention then
    return c_unmeasured;
  end if;

  v_pickup_end := greatest(v_from, least(coalesce(v_pickup_at, v_to), v_to));

  with pts as (
    select clp.lat, clp.lng, clp.recorded_at
      from public.courier_location_pings clp
     where clp.courier_user_id = v_courier
       and clp.recorded_at >= v_from
       and clp.recorded_at <= v_to
    union all
    -- The samples immediately outside each edge, so the segments crossing them
    -- are prorated instead of vanishing — but only when they are close enough
    -- to describe continuous travel.
    (select clp.lat, clp.lng, clp.recorded_at
       from public.courier_location_pings clp
      where clp.courier_user_id = v_courier
        and clp.recorded_at < v_from
        and clp.recorded_at >= v_from - c_max_edge_gap
      order by clp.recorded_at desc
      limit 1)
    union all
    (select clp.lat, clp.lng, clp.recorded_at
       from public.courier_location_pings clp
      where clp.courier_user_id = v_courier
        and clp.recorded_at > v_to
        and clp.recorded_at <= v_to + c_max_edge_gap
      order by clp.recorded_at asc
      limit 1)
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
           extract(epoch from (s.t_end - s.t_start)) as dur_s
      from segs s
     where s.t_start is not null
       and s.t_end > s.t_start
       and s.d / extract(epoch from (s.t_end - s.t_start)) <= c_max_speed_mps
  ),
  clipped as (
    select row_number() over ()          as seg_id,
           u.d,
           u.dur_s,
           greatest(u.t_start, v_from)   as w_start,
           least(u.t_end, v_to)          as w_end,
           greatest(0, extract(epoch from (
             least(u.t_end, v_pickup_end) - greatest(u.t_start, v_from)
           ))) / u.dur_s                 as in_pickup
      from usable u
     where least(u.t_end, v_to) > greatest(u.t_start, v_from)
  ),
  bounds as (
    select distinct e.t
      from (
        select public.fn_route_window_start(o.accepted_at, o.courier_assigned_at) as t
          from public.courier_orders o
         where o.assigned_courier_user_id = v_courier
        union all
        select coalesce(o.delivered_at, o.cancelled_at)
          from public.courier_orders o
         where o.assigned_courier_user_id = v_courier
           and coalesce(o.delivered_at, o.cancelled_at) is not null
      ) e
     where e.t is not null
       and e.t > v_from
       and e.t < v_to
  ),
  edges as (
    select c.seg_id, c.w_start as t from clipped c
    union all
    select c.seg_id, c.w_end   as t from clipped c
    union all
    select c.seg_id, b.t
      from clipped c
      join bounds b
        on b.t > c.w_start
       and b.t < c.w_end
  ),
  subs as (
    select e.seg_id,
           e.t                                                    as s_start,
           lead(e.t) over (partition by e.seg_id order by e.t)     as s_end
      from edges e
  ),
  sub_scored as (
    select c.d * extract(epoch from (s.s_end - s.s_start)) / c.dur_s as sub_d,
           greatest(1, (
             select count(*)
               from public.courier_orders o
              where o.assigned_courier_user_id = v_courier
                and public.fn_route_window_start(o.accepted_at, o.courier_assigned_at)
                    <= s.s_start + (s.s_end - s.s_start) / 2
                and coalesce(o.delivered_at, o.cancelled_at, now())
                    >= s.s_start + (s.s_end - s.s_start) / 2
           )) as concurrency
      from subs s
      join clipped c on c.seg_id = s.seg_id
     where s.s_end is not null
       and s.s_end > s.s_start
  )
  select (select count(*) from clipped),
         (select coalesce(sum(
            c.d * extract(epoch from (c.w_end - c.w_start)) / c.dur_s
          ), 0) from clipped c),
         (select coalesce(sum(c.d * c.in_pickup), 0) from clipped c),
         (select coalesce(sum(ss.sub_d / ss.concurrency), 0) from sub_scored ss)
    into v_segments, v_total, v_pickup_leg, v_attributed;

  if v_segments < 1 then
    return c_unmeasured;
  end if;

  return jsonb_build_object(
    'points', v_segments + 1,
    'distance_m', round(v_total)::integer,
    'pickup_distance_m', round(v_pickup_leg)::integer,
    'attributed_distance_m', round(v_attributed)::integer
  );
end;
$$;

revoke execute on function public.fn_courier_order_route(uuid)
  from public, anon, authenticated;
grant execute on function public.fn_courier_order_route(uuid) to service_role;
