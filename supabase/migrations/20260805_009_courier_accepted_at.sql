-- Codex review (PR #1055, P2, round 14): a re-offered order cancelled before
-- the new courier accepted was still measured as accepted work.
--
-- The external cancel route accepts OFFERED rows, so an order can go
-- ACCEPTED (courier A) -> OFFERED (courier B) -> CANCELLED with B never taking
-- it. The row then carries A's accepted_at and B's offer-time
-- courier_assigned_at, and greatest() of those two is a real timestamp — so the
-- window opened, B's deliberating was materialised as delivery work, and it
-- could take a share of a sibling's attributed distance.
--
-- This is the third patch around the same gap, which is the signal that the
-- model was wrong rather than incomplete: accepted_at ("first ever accepted")
-- and courier_assigned_at ("current assignee received it") cannot, in any
-- combination, express "the CURRENT courier has accepted". greatest() was
-- always going to answer that question wrongly somewhere.
--
-- So the fact gets its own column. courier_accepted_at is set when the current
-- assignee takes the order and cleared the moment it passes to someone else who
-- has not. The route window is simply that column — no arithmetic, nothing to
-- get subtly wrong — and NULL means exactly what it says: nobody currently
-- holding this order has accepted it, so there is nothing to measure.
--
--   ordinary      OFFERED (assignee set, cleared) -> ACCEPTED (set)
--   admin re-offer ACCEPTED -> OFFERED (cleared) -> ACCEPTED (set)
--   direct reassign stays ACCEPTED, assignee changes (set to the handover)
--
-- accepted_at is untouched and keeps meaning "first accepted", for SLA and
-- audit.

alter table public.courier_orders
  add column if not exists courier_accepted_at timestamptz;

comment on column public.courier_orders.courier_accepted_at is
  'When the courier CURRENTLY assigned took this order — by accepting it, or by '
  'having an already-accepted order handed to them. NULL while it merely sits '
  'offered to them. Distinct from accepted_at, which records the first ever '
  'acceptance and survives reassignment. This is the route measurement window''s '
  'start.';

-- Backfill with the best answer the old two-column scheme could give.
update public.courier_orders
   set courier_accepted_at = case
         when accepted_at is null          then null
         when courier_assigned_at is null  then accepted_at
         else greatest(accepted_at, courier_assigned_at)
       end
 where courier_accepted_at is null
   and accepted_at is not null;

create or replace function public.stamp_courier_assigned_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_courier_user_id is not null then
      new.courier_assigned_at := coalesce(new.courier_assigned_at, now());
      if new.status = 'ACCEPTED' then
        new.courier_accepted_at := coalesce(new.courier_accepted_at, now());
      end if;
    end if;
    return new;
  end if;

  if new.assigned_courier_user_id is not null
     and new.assigned_courier_user_id is distinct from old.assigned_courier_user_id
  then
    new.courier_assigned_at := now();
    -- Handing over an order that is already ACCEPTED means the new courier is
    -- working on it from this instant. Handing over an offer means they have
    -- not taken it yet.
    new.courier_accepted_at := case when new.status = 'ACCEPTED' then now() else null end;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'ACCEPTED' and new.assigned_courier_user_id is not null then
      new.courier_assigned_at := now();
      new.courier_accepted_at := now();
    elsif new.status = 'OFFERED' then
      -- Back on the market: whoever holds it now has not accepted it.
      new.courier_accepted_at := null;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.stamp_courier_assigned_at() is
  'Maintains courier_assigned_at (when the current assignee received the order) '
  'and courier_accepted_at (when they took it, NULL while merely offered).';

drop trigger if exists trg_courier_assigned_at on public.courier_orders;

create trigger trg_courier_assigned_at
  before insert or update of assigned_courier_user_id, status on public.courier_orders
  for each row
  execute function public.stamp_courier_assigned_at();

-- ---------------------------------------------------------------------------
-- The window is now a column read, everywhere.
-- ---------------------------------------------------------------------------
create or replace function public.fn_courier_order_route(p_order_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_max_speed_mps   constant double precision := 41.7;
  c_trail_retention constant interval := interval '30 days';
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
    'points', 0, 'distance_m', null,
    'pickup_distance_m', null, 'attributed_distance_m', null
  );
begin
  select co.assigned_courier_user_id,
         co.courier_accepted_at,
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
    (select clp.lat, clp.lng, clp.recorded_at
       from public.courier_location_pings clp
      where clp.courier_user_id = v_courier
        and clp.recorded_at < v_from
        and clp.recorded_at >= v_from - c_max_edge_gap
      order by clp.recorded_at desc limit 1)
    union all
    (select clp.lat, clp.lng, clp.recorded_at
       from public.courier_location_pings clp
      where clp.courier_user_id = v_courier
        and clp.recorded_at > v_to
        and clp.recorded_at <= v_to + c_max_edge_gap
      order by clp.recorded_at asc limit 1)
  ),
  segs as (
    select p.recorded_at as t_end,
           lag(p.recorded_at) over w as t_start,
           public.fn_haversine_m(lag(p.lat) over w, lag(p.lng) over w, p.lat, p.lng) as d
      from pts p
    window w as (order by p.recorded_at)
  ),
  usable as (
    select s.d, s.t_start, s.t_end,
           extract(epoch from (s.t_end - s.t_start)) as dur_s
      from segs s
     where s.t_start is not null
       and s.t_end > s.t_start
       and s.d / extract(epoch from (s.t_end - s.t_start)) <= c_max_speed_mps
  ),
  clipped as (
    select row_number() over () as seg_id, u.d, u.dur_s,
           greatest(u.t_start, v_from) as w_start,
           least(u.t_end, v_to) as w_end,
           greatest(0, extract(epoch from (
             least(u.t_end, v_pickup_end) - greatest(u.t_start, v_from)
           ))) / u.dur_s as in_pickup
      from usable u
     where least(u.t_end, v_to) > greatest(u.t_start, v_from)
  ),
  bounds as (
    select distinct e.t from (
      select o.courier_accepted_at as t
        from public.courier_orders o
       where o.assigned_courier_user_id = v_courier
      union all
      select coalesce(o.delivered_at, o.cancelled_at)
        from public.courier_orders o
       where o.assigned_courier_user_id = v_courier
         and coalesce(o.delivered_at, o.cancelled_at) is not null
    ) e
    where e.t is not null and e.t > v_from and e.t < v_to
  ),
  edges as (
    select c.seg_id, c.w_start as t from clipped c
    union all
    select c.seg_id, c.w_end as t from clipped c
    union all
    select c.seg_id, b.t from clipped c join bounds b on b.t > c.w_start and b.t < c.w_end
  ),
  subs as (
    select e.seg_id, e.t as s_start,
           lead(e.t) over (partition by e.seg_id order by e.t) as s_end
      from edges e
  ),
  sub_scored as (
    select c.d * extract(epoch from (s.s_end - s.s_start)) / c.dur_s as sub_d,
           greatest(1, (
             select count(*) from public.courier_orders o
              where o.assigned_courier_user_id = v_courier
                and o.courier_accepted_at <= s.s_start + (s.s_end - s.s_start) / 2
                and coalesce(o.delivered_at, o.cancelled_at, now())
                    >= s.s_start + (s.s_end - s.s_start) / 2
           )) as concurrency
      from subs s join clipped c on c.seg_id = s.seg_id
     where s.s_end is not null and s.s_end > s.s_start
  )
  select (select count(*) from clipped),
         (select coalesce(sum(c.d * extract(epoch from (c.w_end - c.w_start)) / c.dur_s), 0) from clipped c),
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

revoke execute on function public.fn_courier_order_route(uuid) from public, anon, authenticated;
grant execute on function public.fn_courier_order_route(uuid) to service_role;

create or replace function public.trg_compute_courier_order_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_trail_retention interval := interval '30 days';
  v_sibling uuid;
begin
  perform public.fn_materialise_courier_order_route(new.id);

  if new.assigned_courier_user_id is not null and new.courier_accepted_at is not null then
    for v_sibling in
      select o.id
        from public.courier_orders o
       where o.assigned_courier_user_id = new.assigned_courier_user_id
         and o.id <> new.id
         and o.status in ('DELIVERED', 'CANCELLED')
         and o.courier_accepted_at is not null
         and o.courier_accepted_at <= coalesce(new.delivered_at, new.cancelled_at, now())
         and coalesce(o.delivered_at, o.cancelled_at) >= new.courier_accepted_at
         and o.courier_accepted_at >= now() - c_trail_retention
    loop
      perform public.fn_materialise_courier_order_route(v_sibling);
    end loop;
  end if;

  return null;
end;
$$;

revoke execute on function public.trg_compute_courier_order_route()
  from public, anon, authenticated, service_role;

drop function if exists public.fn_route_window_start(timestamptz, timestamptz);
