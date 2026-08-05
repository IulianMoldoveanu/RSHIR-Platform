-- Codex review (PR #1055, 2×P2, round 8). Both come from the same half-done
-- change: 20260805_001 introduced courier_assigned_at for the measured order's
-- own window, and left every other use of a start time on the old field.
--
-- 1. greatest() IGNORES NULLS, SO OFFERS BECAME MEASURABLE.
--    `greatest(accepted_at, coalesce(courier_assigned_at, accepted_at))` was
--    meant to read "the later of the two". For an order that was assigned but
--    never accepted it reads courier_assigned_at instead of NULL, because
--    greatest() skips NULL inputs rather than propagating them. The
--    `v_from is null` guard then stopped firing, and an OFFERED order cancelled
--    without ever being accepted — reachable through the external cancel route,
--    whose cancellable set includes OFFERED — could store a route distance for
--    a courier who never took the job.
--
-- 2. CONCURRENCY STILL CUT ON THE FIRST ACCEPTANCE.
--    accepted_at deliberately keeps meaning "first accepted" and survives
--    reassignment. But the attribution splitter still treated a sibling's
--    accepted_at as the moment it joined THIS courier's load. A sibling
--    reassigned to them at 10:10 whose preserved accepted_at reads 10:00 makes
--    every order they genuinely carried from 10:00 to 10:10 look shared —
--    dividing distance among orders that were still with someone else, and
--    breaking the attributed-distance invariant in the undercounting
--    direction.
--
-- One helper now answers "when did this order start counting for the courier
-- who holds it", and all three sites — the measured window, the concurrency
-- cut points, and the concurrency count — ask it.

create or replace function public.fn_route_window_start(
  p_accepted_at timestamptz,
  p_assigned_at timestamptz
)
returns timestamptz
language sql
immutable
parallel safe
set search_path = ''
as $$
  -- Deliberately not STRICT: a NULL assignment time must fall back to the
  -- accept time, while a NULL accept time must stay NULL no matter what the
  -- assignment says. That asymmetry is the whole point.
  select case
           when p_accepted_at is null then null
           when p_assigned_at is null then p_accepted_at
           else greatest(p_accepted_at, p_assigned_at)
         end;
$$;

comment on function public.fn_route_window_start(timestamptz, timestamptz) is
  'When a courier order starts counting for the courier currently assigned to '
  'it: the later of accepted_at and courier_assigned_at, or NULL if it was '
  'never accepted. Never infers a start from assignment alone — an offer that '
  'was never taken has no window.';

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
         public.fn_route_window_start(co.accepted_at, co.courier_assigned_at),
         co.picked_up_at,
         coalesce(co.delivered_at, co.cancelled_at, now())
    into v_courier, v_from, v_pickup_at, v_to
    from public.courier_orders co
   where co.id = p_order_id;

  -- Never assigned, never accepted, or no window at all.
  if v_courier is null or v_from is null or v_to <= v_from then
    return c_unmeasured;
  end if;

  -- The window opens before the trail horizon, so part of it has been purged
  -- and no honest total exists.
  if v_from < now() - c_trail_retention then
    return c_unmeasured;
  end if;

  -- A reassignment after pickup would leave pickup_at before the window; the
  -- approach leg is then empty rather than negative.
  v_pickup_end := greatest(v_from, least(coalesce(v_pickup_at, v_to), v_to));

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
  -- Every instant inside this window at which the courier's open-order count
  -- changes — measured from when each order started counting for THEM, not
  -- from a previous courier's acceptance.
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
revoke execute on function public.fn_route_window_start(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.fn_route_window_start(timestamptz, timestamptz) to service_role;

-- The sibling re-measure loop must use the same definition of "started
-- counting", or a reassigned sibling drags in windows it never shared.
create or replace function public.trg_compute_courier_order_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_trail_retention interval := interval '30 days';
  v_self_start timestamptz;
  v_sibling uuid;
begin
  perform public.fn_materialise_courier_order_route(new.id);

  v_self_start := public.fn_route_window_start(new.accepted_at, new.courier_assigned_at);

  if new.assigned_courier_user_id is not null and v_self_start is not null then
    for v_sibling in
      select o.id
        from public.courier_orders o
       where o.assigned_courier_user_id = new.assigned_courier_user_id
         and o.id <> new.id
         and o.status in ('DELIVERED', 'CANCELLED')
         and public.fn_route_window_start(o.accepted_at, o.courier_assigned_at) is not null
         -- windows overlap
         and public.fn_route_window_start(o.accepted_at, o.courier_assigned_at)
             <= coalesce(new.delivered_at, new.cancelled_at, now())
         and coalesce(o.delivered_at, o.cancelled_at) >= v_self_start
         -- only siblings whose trail is still complete
         and public.fn_route_window_start(o.accepted_at, o.courier_assigned_at)
             >= now() - c_trail_retention
    loop
      perform public.fn_materialise_courier_order_route(v_sibling);
    end loop;
  end if;

  return null;
end;
$$;

revoke execute on function public.trg_compute_courier_order_route()
  from public, anon, authenticated, service_role;
