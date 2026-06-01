-- Fleet SLA scorecard (fleet marketplace Phase 3).
--
-- PR-A added the lifecycle timestamps; this turns them into a MEASUREMENT. For
-- each fleet × vertical × day it computes the dwell-time percentiles (P50/P90,
-- NOT the mean -- a few slow drops must not hide behind an average) and the
-- delivery rate. This is the quality signal that feeds allocation: a fleet's
-- rolling scorecard -> its share of capacity blocks (the score->quota loop is a
-- later behavioral PR; this is the input it needs).
--
-- Stages measured:
--   accept   offered_at  -> accepted_at    (how fast the fleet claims work)
--   pickup   accepted_at -> picked_up_at   (how fast it reaches the vendor)
--   dropoff  picked_up_at-> delivered_at   (the leg the customer feels)
--   total    offered_at  -> delivered_at   (end to end)
--
-- Orders are bucketed by created_at::date, and the snapshot is (re)computed for
-- the prior day each night -- so an order created late yesterday but delivered
-- after midnight is still counted delivered. All additive.

create table if not exists public.fleet_sla_daily (
  fleet_id        uuid    not null,
  vertical        text    not null,
  day             date    not null,
  orders_total    integer not null default 0,
  delivered       integer not null default 0,
  cancelled       integer not null default 0,
  delivery_rate   numeric,                       -- delivered / total (0..1)
  accept_p50_sec  integer,
  accept_p90_sec  integer,
  pickup_p50_sec  integer,
  pickup_p90_sec  integer,
  dropoff_p50_sec integer,
  dropoff_p90_sec integer,
  total_p50_sec   integer,
  total_p90_sec   integer,
  computed_at     timestamptz not null default now(),
  primary key (fleet_id, vertical, day)
);

comment on table public.fleet_sla_daily is
  'Fleet marketplace Phase 3: nightly SLA scorecard per fleet x vertical x day. '
  'P50/P90 dwell times (accept/pickup/dropoff/total) + delivery rate, computed '
  'from courier_orders lifecycle timestamps. Feeds the score->quota allocation '
  'loop.';

-- Compute (idempotent upsert) the scorecard for one day.
create or replace function public.compute_fleet_sla(p_day date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rows integer;
begin
  with agg as (
    select
      co.fleet_id,
      coalesce(nullif(co.vertical, ''), 'rshir') as vertical,
      count(*)                                              as orders_total,
      count(*) filter (where co.status = 'DELIVERED')       as delivered,
      count(*) filter (where co.status = 'CANCELLED')       as cancelled,
      percentile_cont(0.5) within group (order by extract(epoch from (co.accepted_at  - co.offered_at)))
        filter (where co.offered_at  is not null and co.accepted_at  is not null) as accept_p50,
      percentile_cont(0.9) within group (order by extract(epoch from (co.accepted_at  - co.offered_at)))
        filter (where co.offered_at  is not null and co.accepted_at  is not null) as accept_p90,
      percentile_cont(0.5) within group (order by extract(epoch from (co.picked_up_at - co.accepted_at)))
        filter (where co.accepted_at is not null and co.picked_up_at is not null) as pickup_p50,
      percentile_cont(0.9) within group (order by extract(epoch from (co.picked_up_at - co.accepted_at)))
        filter (where co.accepted_at is not null and co.picked_up_at is not null) as pickup_p90,
      percentile_cont(0.5) within group (order by extract(epoch from (co.delivered_at - co.picked_up_at)))
        filter (where co.picked_up_at is not null and co.delivered_at is not null) as dropoff_p50,
      percentile_cont(0.9) within group (order by extract(epoch from (co.delivered_at - co.picked_up_at)))
        filter (where co.picked_up_at is not null and co.delivered_at is not null) as dropoff_p90,
      percentile_cont(0.5) within group (order by extract(epoch from (co.delivered_at - co.offered_at)))
        filter (where co.offered_at  is not null and co.delivered_at is not null) as total_p50,
      percentile_cont(0.9) within group (order by extract(epoch from (co.delivered_at - co.offered_at)))
        filter (where co.offered_at  is not null and co.delivered_at is not null) as total_p90
    from public.courier_orders co
    where co.fleet_id is not null
      and co.created_at >= p_day
      and co.created_at <  (p_day + 1)
    group by co.fleet_id, coalesce(nullif(co.vertical, ''), 'rshir')
  )
  insert into public.fleet_sla_daily as t (
    fleet_id, vertical, day, orders_total, delivered, cancelled, delivery_rate,
    accept_p50_sec, accept_p90_sec, pickup_p50_sec, pickup_p90_sec,
    dropoff_p50_sec, dropoff_p90_sec, total_p50_sec, total_p90_sec, computed_at
  )
  select
    fleet_id, vertical, p_day, orders_total, delivered, cancelled,
    round(delivered::numeric / nullif(orders_total, 0), 4),
    round(accept_p50)::int,  round(accept_p90)::int,
    round(pickup_p50)::int,  round(pickup_p90)::int,
    round(dropoff_p50)::int, round(dropoff_p90)::int,
    round(total_p50)::int,   round(total_p90)::int,
    now()
  from agg
  on conflict (fleet_id, vertical, day) do update set
    orders_total    = excluded.orders_total,
    delivered       = excluded.delivered,
    cancelled       = excluded.cancelled,
    delivery_rate   = excluded.delivery_rate,
    accept_p50_sec  = excluded.accept_p50_sec,
    accept_p90_sec  = excluded.accept_p90_sec,
    pickup_p50_sec  = excluded.pickup_p50_sec,
    pickup_p90_sec  = excluded.pickup_p90_sec,
    dropoff_p50_sec = excluded.dropoff_p50_sec,
    dropoff_p90_sec = excluded.dropoff_p90_sec,
    total_p50_sec   = excluded.total_p50_sec,
    total_p90_sec   = excluded.total_p90_sec,
    computed_at     = excluded.computed_at;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

comment on function public.compute_fleet_sla(date) is
  'Fleet marketplace Phase 3: (re)computes fleet_sla_daily for one day from '
  'courier_orders lifecycle timestamps. Idempotent upsert. P50/P90 (not mean).';

-- Cron/platform only. Revoke authenticated too (Supabase default privileges
-- auto-grant it on creation) -- no client should trigger a scorecard recompute.
revoke all on function public.compute_fleet_sla(date) from public, anon, authenticated;
grant execute on function public.compute_fleet_sla(date) to service_role;

-- RLS: fleet members read their own fleet's scorecard; platform via service_role.
alter table public.fleet_sla_daily enable row level security;

drop policy if exists fleet_sla_daily_read on public.fleet_sla_daily;
create policy fleet_sla_daily_read on public.fleet_sla_daily
  for select to authenticated
  using (fleet_id = public.current_courier_fleet_id());

-- Nightly: recompute yesterday (late-completing orders are then counted).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'compute-fleet-sla-daily') then
    perform cron.schedule(
      'compute-fleet-sla-daily',
      '30 2 * * *',  -- 02:30 UTC daily
      $cron$ select public.compute_fleet_sla(((now() at time zone 'utc')::date - 1)); $cron$
    );
  end if;
end$$;
