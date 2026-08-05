-- Codex review (PR #1055, two P2s). Both are the same underlying mistake:
-- the measurement trusted things the trail had already refused.
--
-- 1. TAIL CLOSURE LEAKED REJECTED FIXES.
--    record_courier_ping deliberately refuses a fix worse than 100m accuracy
--    from the trail — but still writes it to courier_shifts.last_* (presence
--    must stay liberal or dispatch drops the courier). fn_courier_order_route
--    then unioned that shift position in as a final point, so the very fix the
--    accuracy filter had discarded came back as the last segment, inflating
--    distance in exactly the case the filter existed to prevent.
--
--    Rather than teach the tail to re-check eligibility, drop it. The tail was
--    buying almost nothing: the client reports every ~30s and the trail stores
--    any fix at least 15m from the last one, so while a courier is moving the
--    newest trail point IS the newest fix. The closure only ever helped by
--    that 15m threshold — not worth a second, differently-vetted source of
--    truth. The trail is now the only input.
--
-- 2. "MEASURED" COUNTED RAW POINTS, NOT USABLE SEGMENTS.
--    v_points counted rows in `pts`, but distance only ever came from segments
--    surviving the zero-duration and >150 km/h filters. One ping plus a
--    duplicate, or a single segment rejected as a teleport, still reported
--    points >= 2 — so the row materialised a confident 0 m and the admin
--    coverage stat counted it as successfully measured. Precisely the
--    "confident zero" this function was written to never produce.
--
--    points is now derived from the segments that actually contributed:
--    zero usable segments means unmeasured, full stop.

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
         coalesce(sum(s.d) filter (where s.t_end <= coalesce(v_pickup_at, v_to)), 0),
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

comment on column public.courier_orders.route_points is
  'GPS samples that actually contributed to the numbers above — segments '
  'rejected as zero-duration or implausibly fast do not count. 0 means the '
  'route could not be measured at all; a measured route is always >= 2.';
