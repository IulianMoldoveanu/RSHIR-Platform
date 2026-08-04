-- HIR Courier — per-order distance, derived from the GPS trail (20260804_008).
--
-- The trail is raw personal location data and dies after 30 days. The numbers
-- derived from it are operational measurements and must not. So the aggregate
-- is MATERIALISED onto courier_orders the moment the order closes: after the
-- purge runs, "this delivery was 4.2 km" survives, "the courier was at these
-- coordinates at 14:32" does not.
--
-- TIME metrics need no new storage — courier_orders already carries
-- offered_at / accepted_at / picked_up_at / in_transit_at / delivered_at.
-- Distance was the only missing half.
--
-- ── TWO DISTANCES, AND WHY ──────────────────────────────────────────────────
-- A courier may legitimately hold several orders at once (courier_profiles.
-- max_parallel_orders). One kilometre driven with two orders on board is one
-- kilometre of fuel, but it advances two deliveries. Reporting it once per
-- order would understate what the courier drove; reporting it in full on both
-- would invent a kilometre that never happened — and per_km_cents payouts
-- would pay for it twice. So we record both readings:
--
--   route_distance_m            what the courier actually drove during this
--                               order's window. The intuitive answer, and the
--                               one to show a human. Sums to MORE than the
--                               shift total when orders were batched.
--   route_attributed_distance_m the same driving, split evenly between the
--                               orders that shared each segment. Identical to
--                               route_distance_m for a solo order. Summing
--                               this across orders reconstructs the real
--                               distance — so this is the one that may safely
--                               be multiplied by a per-km rate.
--
-- The attributed sum can fall a little SHORT of the true total: a segment that
-- straddles the moment a second order was accepted is halved for the order
-- that can see it, while the newly-accepted order has no sample old enough to
-- claim the other half. The gap is bounded by one sampling interval per batch
-- boundary (tens of metres), and it always errs low — it can never pay a
-- courier for a kilometre nobody drove.

-- ---------------------------------------------------------------------------
-- 1. Storage.
-- ---------------------------------------------------------------------------
alter table public.courier_orders
  add column if not exists route_distance_m            integer,
  add column if not exists route_pickup_distance_m     integer,
  add column if not exists route_attributed_distance_m integer,
  add column if not exists route_points                integer,
  add column if not exists route_computed_at           timestamptz;

comment on column public.courier_orders.route_distance_m is
  'Metres the courier actually travelled between accepting and closing this '
  'order, measured from the GPS trail. NULL = not measurable (fewer than two '
  'usable fixes) — which is NOT the same as zero.';
comment on column public.courier_orders.route_pickup_distance_m is
  'The leg of route_distance_m driven before pickup (accept -> picked_up_at). '
  'Dispatch-quality signal: how far couriers travel to reach the vendor.';
comment on column public.courier_orders.route_attributed_distance_m is
  'route_distance_m with each segment divided by the number of orders the '
  'courier was carrying at that moment. Equal to route_distance_m for solo '
  'orders. Use THIS for per-km payouts — summing it never double-counts.';
comment on column public.courier_orders.route_points is
  'Usable GPS samples behind the numbers above. 0 or 1 means no distance '
  'could be measured (GPS off, permission denied, or a very short window).';
comment on column public.courier_orders.route_computed_at is
  'When the aggregate was materialised — set once, on the transition to '
  'DELIVERED or CANCELLED.';

-- ---------------------------------------------------------------------------
-- 2. The measurement.
--    VOLATILE on purpose: it is called from an AFTER UPDATE trigger and must
--    read the row version that trigger just produced.
-- ---------------------------------------------------------------------------
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

  v_points      integer := 0;
  v_total       double precision := 0;
  v_pickup_leg  double precision := 0;
  v_attributed  double precision := 0;
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
    union all
    -- Tail closure. The displacement filter deliberately suppresses the last
    -- few fixes of a delivery (the courier is slowing down, then standing at
    -- the door), so the trail can stop short of where the order actually
    -- ended. courier_shifts.last_* is written on EVERY fix, so it is always
    -- the freshest known position — fold it in when it falls inside the
    -- window. Costs nothing: it is data we already collected.
    select * from (
      select cs.last_lat, cs.last_lng, cs.last_seen_at
        from public.courier_shifts cs
       where cs.courier_user_id = v_courier
         and cs.last_lat is not null
         and cs.last_lng is not null
         and cs.last_seen_at is not null
         and cs.last_seen_at >= v_from
         and cs.last_seen_at <= v_to
       order by cs.last_seen_at desc
       limit 1
    ) tail
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
  select (select count(*) from pts),
         coalesce((select sum(d) from scored), 0),
         coalesce((select sum(d) from scored
                    where t_end <= coalesce(v_pickup_at, v_to)), 0),
         coalesce((select sum(d / concurrency) from scored), 0)
    into v_points, v_total, v_pickup_leg, v_attributed;

  -- One point (or none) is not a route. Report "unknown", never a confident 0.
  if v_points < 2 then
    return jsonb_build_object(
      'points', v_points,
      'distance_m', null,
      'pickup_distance_m', null,
      'attributed_distance_m', null
    );
  end if;

  return jsonb_build_object(
    'points', v_points,
    'distance_m', round(v_total)::integer,
    'pickup_distance_m', round(v_pickup_leg)::integer,
    'attributed_distance_m', round(v_attributed)::integer
  );
end;
$$;

revoke execute on function public.fn_courier_order_route(uuid) from public, anon;
grant execute on function public.fn_courier_order_route(uuid) to service_role;

comment on function public.fn_courier_order_route(uuid) is
  'Measures a courier order''s travelled distance from the GPS trail. Returns '
  'jsonb {points, distance_m, pickup_distance_m, attributed_distance_m}; the '
  'distances are NULL when fewer than two usable fixes exist. Callable live '
  'for an in-progress order (window ends at now()); materialised onto the row '
  'by trigger when the order closes. service_role only.';

-- ---------------------------------------------------------------------------
-- 3. Materialise on close.
--    Trigger rather than app code because DELIVERED/CANCELLED is reachable
--    from several paths (courier app, fleet panel, admin, Hepi, webhooks) and
--    a measurement that only some of them record is worse than none.
-- ---------------------------------------------------------------------------
create or replace function public.fn_materialise_courier_order_route(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_route jsonb;
begin
  v_route := public.fn_courier_order_route(p_order_id);

  -- Touches no status column, so the trigger's WHEN clause cannot re-fire on
  -- the row version this produces.
  update public.courier_orders
     set route_distance_m            = (v_route ->> 'distance_m')::integer,
         route_pickup_distance_m     = (v_route ->> 'pickup_distance_m')::integer,
         route_attributed_distance_m = (v_route ->> 'attributed_distance_m')::integer,
         route_points                = (v_route ->> 'points')::integer,
         route_computed_at           = now()
   where id = p_order_id;
end;
$$;

comment on function public.fn_materialise_courier_order_route(uuid) is
  'Measures one courier order and writes the aggregate onto its row.';

create or replace function public.trg_compute_courier_order_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sibling uuid;
begin
  perform public.fn_materialise_courier_order_route(new.id);

  -- An order that is still open has no delivered_at, so it reads as "active
  -- until now()" — which means the FIRST order of a batch to close sees its
  -- siblings as sharing every segment, including ones they had already
  -- finished with. Left alone, the order in which a courier happens to tap
  -- "delivered" would change the numbers.
  --
  -- So closing an order re-measures the already-closed orders whose windows
  -- overlapped it. Each close makes the picture more complete, and the last
  -- one to close leaves every member of the batch agreeing. Bounded by real
  -- concurrency (courier_profiles.max_parallel_orders), not by history.
  if new.assigned_courier_user_id is not null and new.accepted_at is not null then
    for v_sibling in
      select o.id
        from public.courier_orders o
       where o.assigned_courier_user_id = new.assigned_courier_user_id
         and o.id <> new.id
         and o.status in ('DELIVERED', 'CANCELLED')
         and o.accepted_at is not null
         -- windows overlap
         and o.accepted_at <= coalesce(new.delivered_at, new.cancelled_at, now())
         and coalesce(o.delivered_at, o.cancelled_at) >= new.accepted_at
    loop
      perform public.fn_materialise_courier_order_route(v_sibling);
    end loop;
  end if;

  return null;
end;
$$;

comment on function public.trg_compute_courier_order_route() is
  'AFTER UPDATE trigger body: materialises the closing order''s route, then '
  're-materialises the already-closed orders it shared road with, so a '
  'batch''s numbers do not depend on the order the courier closed them in.';

drop trigger if exists trg_courier_orders_compute_route on public.courier_orders;

create trigger trg_courier_orders_compute_route
  after update of status on public.courier_orders
  for each row
  when (
    new.status in ('DELIVERED', 'CANCELLED')
    and old.status is distinct from new.status
  )
  execute function public.trg_compute_courier_order_route();
