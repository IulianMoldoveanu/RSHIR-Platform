-- Codex review (PR #1055, 2×P2, round 5).
--
-- 1. THE ORDER WINDOW TRUNCATED ITS OWN EDGES.
--    `pts` took only samples inside [accepted_at, closed_at]. At ~30s fixes the
--    accept moment almost never lands on a sample, so the segment spanning the
--    start was dropped whole — the route simply began at the first fix after
--    accept. Same loss at the close. Every order was low by up to two sampling
--    intervals, on the courier card, the fleet panel and avg_distance_m alike.
--
--    This is the SAME defect 20260804_012 fixed for the pickup leg. Fixing it
--    there and not here was the mistake; the boundary rule belongs to every
--    interval, not to one of them. So it is generalised now: pull in the
--    neighbouring sample on each side, and let every distance be the segment's
--    length times its temporal OVERLAP with the interval being asked about.
--    The pickup leg is that same rule applied to [accept, pickup] — it stops
--    being a special case and becomes an instance.
--
--    A neighbouring sample can be old (a courier who was offline before the
--    order). That is safe: proration divides by the full segment duration, so
--    a three-day-old previous fix contributes a correspondingly tiny slice.
--    The speed filter still judges the RAW segment, before clipping.
--
-- 2. THE RETENTION GATE ONLY COVERED SIBLINGS.
--    20260804_014 refused to re-measure siblings whose trail had aged out, but
--    the order being closed was still measured unconditionally. A zombie
--    IN_TRANSIT accepted 35 days ago and cancelled today has pings for only its
--    last 30 days, so it returned a non-NULL but truncated distance — and
--    because nothing was being overwritten, guard 2 let it through and the
--    coverage stat counted it as measured.
--
--    The check moves into fn_courier_order_route, where every caller sees it:
--    the trigger, the sibling loop, and the live in-progress read. A window
--    that opens before the trail horizon cannot be measured completely, so it
--    reports unmeasured rather than confidently reporting the part it can see.
--    The trigger's own sibling gate stays — now an optimisation that avoids
--    pointless work rather than the only thing standing between a late close
--    and a corrupted history.

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

  v_courier   uuid;
  v_from      timestamptz;
  v_pickup_at timestamptz;
  v_to        timestamptz;
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
         co.accepted_at,
         co.picked_up_at,
         coalesce(co.delivered_at, co.cancelled_at, now())
    into v_courier, v_from, v_pickup_at, v_to
    from public.courier_orders co
   where co.id = p_order_id;

  -- Never accepted, or never assigned: there is no window to measure.
  if v_courier is null or v_from is null or v_to <= v_from then
    return c_unmeasured;
  end if;

  -- The window opens before the trail horizon, so part of it has been purged
  -- and no honest total exists. Report unmeasured rather than the surviving
  -- tail dressed up as the whole journey.
  if v_from < now() - c_trail_retention then
    return c_unmeasured;
  end if;

  -- The pickup leg runs from accept to pickup — or to the close, when the
  -- order ended before anything was ever collected.
  v_pickup_end := least(coalesce(v_pickup_at, v_to), v_to);

  with pts as (
    select clp.lat, clp.lng, clp.recorded_at
      from public.courier_location_pings clp
     where clp.courier_user_id = v_courier
       and clp.recorded_at >= v_from
       and clp.recorded_at <= v_to
    union all
    -- The samples immediately outside each edge, so the segments crossing
    -- them exist to be prorated instead of vanishing.
    (select clp.lat, clp.lng, clp.recorded_at
       from public.courier_location_pings clp
      where clp.courier_user_id = v_courier
        and clp.recorded_at < v_from
      order by clp.recorded_at desc
      limit 1)
    union all
    (select clp.lat, clp.lng, clp.recorded_at
       from public.courier_location_pings clp
      where clp.courier_user_id = v_courier
        and clp.recorded_at > v_to
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
       -- Judge the raw segment: a teleport is a teleport whether or not it
       -- happens to straddle a boundary.
       and s.d / extract(epoch from (s.t_end - s.t_start)) <= c_max_speed_mps
  ),
  clipped as (
    select u.d,
           u.dur_s,
           greatest(u.t_start, v_from) as w_start,
           least(u.t_end, v_to)        as w_end,
           -- Share of this segment that falls inside the order window.
           greatest(0, extract(epoch from (
             least(u.t_end, v_to) - greatest(u.t_start, v_from)
           ))) / u.dur_s as in_window,
           -- Share that falls inside the approach-to-vendor leg.
           greatest(0, extract(epoch from (
             least(u.t_end, v_pickup_end) - greatest(u.t_start, v_from)
           ))) / u.dur_s as in_pickup
      from usable u
  ),
  scored as (
    select c.d,
           c.in_window,
           c.in_pickup,
           -- Concurrency judged at the middle of the part we are counting.
           greatest(1, (
             select count(*)
               from public.courier_orders o
              where o.assigned_courier_user_id = v_courier
                and o.accepted_at is not null
                and o.accepted_at <= c.w_start + (c.w_end - c.w_start) / 2
                and coalesce(o.delivered_at, o.cancelled_at, now())
                    >= c.w_start + (c.w_end - c.w_start) / 2
           )) as concurrency
      from clipped c
     where c.in_window > 0
  )
  select count(*),
         coalesce(sum(s.d * s.in_window), 0),
         coalesce(sum(s.d * s.in_pickup), 0),
         coalesce(sum(s.d * s.in_window / s.concurrency), 0)
    into v_segments, v_total, v_pickup_leg, v_attributed
    from scored s;

  -- No usable segment is not a short trip — it is no measurement at all.
  if v_segments < 1 then
    return c_unmeasured;
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

-- CREATE OR REPLACE keeps the existing ACL, but a from-scratch run would
-- create this fresh with default privileges — so restate the lockdown.
revoke execute on function public.fn_courier_order_route(uuid)
  from public, anon, authenticated;
grant execute on function public.fn_courier_order_route(uuid) to service_role;

comment on function public.fn_courier_order_route(uuid) is
  'Measures a courier order''s travelled distance from the GPS trail. Every '
  'distance is a segment''s length times its temporal overlap with the '
  'interval asked about, so neither the order window nor the pickup leg loses '
  'the segments that straddle its edges. Returns unmeasured when the window '
  'opens before the 30-day trail horizon, or when no usable segment survives '
  'the zero-duration and speed filters. service_role only.';
