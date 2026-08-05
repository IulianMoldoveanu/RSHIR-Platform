-- Codex review (PR #1055, P2, round 7): a reassigned order measured the new
-- courier from the OLD courier's accept time.
--
-- Confirmed on both reassignment paths, and the second is worse than reported:
--
--   fleet/actions.ts reassigns while leaving status ACCEPTED. stamp_courier_
--   lifecycle_timestamps only stamps when the status actually changes, so
--   accepted_at keeps pointing at the previous courier's moment.
--
--   api/dispatch/reassign flips ACCEPTED -> OFFERED, so the status DOES change
--   — but when the new courier accepts, the trigger runs
--   `accepted_at := coalesce(accepted_at, now())`, and accepted_at is already
--   set, so coalesce keeps the stale value too.
--
-- Either way the route window opens before the courier being measured had the
-- job: their unrelated driving, and any orders they were carrying at the time,
-- land on this order's distance and attribution.
--
-- FIX: record the missing fact rather than destroy an existing one. accepted_at
-- keeps meaning "when this order was first accepted" — SLA and audit still want
-- that. A new courier_assigned_at records when the CURRENT courier got it, and
-- the route window starts at the later of the two.
--
-- For an ordinary order the assignment happens at the offer, before the accept,
-- so greatest() picks accepted_at and nothing changes. Only a reassignment
-- moves the start — which is exactly the case that was wrong.
--
-- A trigger, not app code, because reassignment is reachable from the fleet
-- panel and the admin dispatch API today and the next path would silently miss
-- it.

alter table public.courier_orders
  add column if not exists courier_assigned_at timestamptz;

comment on column public.courier_orders.courier_assigned_at is
  'When the CURRENT assigned_courier_user_id was put on this order. Distinct '
  'from accepted_at, which records the first acceptance and survives '
  'reassignment. Route measurement starts at the later of the two so a '
  'reassigned courier is never measured from before they had the job.';

create or replace function public.stamp_courier_assigned_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_courier_user_id is not null then
      new.courier_assigned_at := coalesce(new.courier_assigned_at, now());
    end if;
    return new;
  end if;

  -- Re-stamp on every genuine change of assignee, including the first one.
  -- Unassignment (-> null) leaves the last stamp alone: it costs nothing and
  -- keeps the history of who last held the order.
  if new.assigned_courier_user_id is not null
     and new.assigned_courier_user_id is distinct from old.assigned_courier_user_id
  then
    new.courier_assigned_at := now();
  end if;

  return new;
end;
$$;

comment on function public.stamp_courier_assigned_at() is
  'Keeps courier_orders.courier_assigned_at in step with assigned_courier_user_id, '
  'whichever code path does the assigning.';

drop trigger if exists trg_courier_assigned_at on public.courier_orders;

create trigger trg_courier_assigned_at
  before insert or update of assigned_courier_user_id on public.courier_orders
  for each row
  execute function public.stamp_courier_assigned_at();

-- Backfill: for existing rows the best available answer is the accept time
-- (or the offer, for orders that never got that far). Rows reassigned in the
-- past cannot be recovered — but none of them have a measured route either,
-- since the trail only starts today.
update public.courier_orders
   set courier_assigned_at = coalesce(accepted_at, offered_at, created_at)
 where assigned_courier_user_id is not null
   and courier_assigned_at is null;

-- ---------------------------------------------------------------------------
-- Route window now opens at the later of accept and assignment.
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
         -- The window belongs to the courier being measured, not to whoever
         -- accepted the order first.
         greatest(co.accepted_at, coalesce(co.courier_assigned_at, co.accepted_at)),
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
