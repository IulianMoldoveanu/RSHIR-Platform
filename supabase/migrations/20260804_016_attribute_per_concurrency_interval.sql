-- Codex review (PR #1055, P2, round 6): attribution could sum ABOVE the real
-- distance — breaking the one property this column exists to guarantee.
--
-- Concurrency was sampled once, at the midpoint of the clipped slice, and that
-- single divisor was then applied to the whole slice. When a sibling opens or
-- closes INSIDE a segment, the two orders disagree about that segment:
--
--   30s segment, order B accepted 5s before its end.
--     A's slice is the full 30s; its midpoint at 15s still sees A alone, so A
--     claims the whole distance d.
--     B's slice is the last 5s; its midpoint at 27.5s sees both, so B claims
--     (d × 5/30) / 2.
--   Total claimed: 1.083 d for d actually driven.
--
-- route_attributed_distance_m is documented as the one number safe to multiply
-- by a per-km rate precisely because summing it cannot exceed reality. A
-- guarantee that is merely usually true is worse than none, because it is the
-- one people stop checking.
--
-- Fix: cut every segment at the moments this courier's open-order count
-- actually changes, so concurrency is CONSTANT across each piece rather than
-- sampled from it. Attribution then telescopes exactly: every metre driven is
-- divided among precisely the orders that were open for it, and the shares sum
-- to one.
--
-- This also closes the opposite gap noted when the split was introduced
-- (20260804_009): a segment straddling a batch boundary used to be halved for
-- the order that could see it while the newly-accepted order had no sample old
-- enough to claim the other half. With boundary samples (20260804_015) and
-- per-interval cutting, the halves now meet. Attribution sums to the real
-- distance exactly, not merely below it.
--
-- Cost is bounded: the cut points are only this courier's order transitions
-- INSIDE the window, which is a handful even for a busy shift.

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
         co.accepted_at,
         co.picked_up_at,
         coalesce(co.delivered_at, co.cancelled_at, now())
    into v_courier, v_from, v_pickup_at, v_to
    from public.courier_orders co
   where co.id = p_order_id;

  if v_courier is null or v_from is null or v_to <= v_from then
    return c_unmeasured;
  end if;

  -- The window opens before the trail horizon, so part of it has been purged
  -- and no honest total exists.
  if v_from < now() - c_trail_retention then
    return c_unmeasured;
  end if;

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
    select row_number() over ()          as seg_id,
           u.d,
           u.dur_s,
           greatest(u.t_start, v_from)   as w_start,
           least(u.t_end, v_to)          as w_end,
           -- Share of this segment inside the approach-to-vendor leg.
           greatest(0, extract(epoch from (
             least(u.t_end, v_pickup_end) - greatest(u.t_start, v_from)
           ))) / u.dur_s                 as in_pickup
      from usable u
     where least(u.t_end, v_to) > greatest(u.t_start, v_from)
  ),
  -- Every instant inside this window at which the courier's open-order count
  -- changes. Restricted to the window, so this stays a handful of rows.
  bounds as (
    select distinct e.t
      from (
        select o.accepted_at as t
          from public.courier_orders o
         where o.assigned_courier_user_id = v_courier
           and o.accepted_at is not null
        union all
        select coalesce(o.delivered_at, o.cancelled_at)
          from public.courier_orders o
         where o.assigned_courier_user_id = v_courier
           and coalesce(o.delivered_at, o.cancelled_at) is not null
      ) e
     where e.t > v_from
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
  -- One row per stretch over which concurrency is genuinely constant.
  sub_scored as (
    select c.d * extract(epoch from (s.s_end - s.s_start)) / c.dur_s as sub_d,
           greatest(1, (
             select count(*)
               from public.courier_orders o
              where o.assigned_courier_user_id = v_courier
                and o.accepted_at is not null
                and o.accepted_at <= s.s_start + (s.s_end - s.s_start) / 2
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
  'interval asked about, and attribution divides each stretch by the number of '
  'orders open across THAT stretch — so summing attributed distance over a '
  'batch reproduces the driven distance exactly, in either direction. Returns '
  'unmeasured when the window opens before the 30-day trail horizon, or when '
  'no usable segment survives the filters. service_role only.';
