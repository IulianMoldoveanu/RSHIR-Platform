-- Migration: courier daily KPI rollup (Hepi backend brain foundation)
--
-- Point 4 of the HIR Curier ops roadmap: "Hepi sits at the base of the
-- infrastructure, self-improving, analysing and STORING the data of ALL
-- couriers." This is the data foundation — NOT a user-facing tab (the Hepi
-- courier chat tab was removed). A nightly pure-SQL job rolls up each courier's
-- operational signals into a durable per-day table, and a 7-day view exposes
-- the rollup for dispatch / allocation / Hepi to consume.
--
-- Pure SQL + pg_cron (no edge function / vault): the aggregation reads tables
-- that already exist (courier_orders lifecycle timestamps, courier_shifts,
-- delivery_ratings, courier_combo_pushes). Day boundaries use Europe/Bucharest
-- (ops timezone), matching how a courier experiences "a day".

create table if not exists public.courier_daily_kpis (
  courier_user_id       uuid not null references auth.users(id) on delete cascade,
  kpi_date              date not null,
  deliveries_completed  int not null default 0,
  deliveries_cancelled  int not null default 0,
  earnings_ron          numeric(10, 2) not null default 0,
  online_minutes        int not null default 0,
  avg_rating            numeric(3, 2),
  ratings_count         int not null default 0,
  combo_pushes_sent     int not null default 0,
  combo_pushes_accepted int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (courier_user_id, kpi_date)
);

create index if not exists idx_courier_daily_kpis_date
  on public.courier_daily_kpis (kpi_date desc);

alter table public.courier_daily_kpis enable row level security;

-- Couriers may read their own daily stats (future "my performance" surface).
-- Fleet managers + platform admins read via the service role (RLS bypassed),
-- so no broad SELECT policy is granted here.
drop policy if exists "courier_daily_kpis_own_read" on public.courier_daily_kpis;
create policy "courier_daily_kpis_own_read"
  on public.courier_daily_kpis for select
  using (courier_user_id = auth.uid());

comment on table public.courier_daily_kpis is
  'Per-courier per-day operational rollup (deliveries, earnings, online time, '
  'ratings, combo acceptance). Populated nightly by rollup_courier_daily_kpis. '
  'The durable "memory" the platform analyses to improve allocation over time.';

-- ── Rollup function ────────────────────────────────────────────────────────
create or replace function public.rollup_courier_daily_kpis(target_date date)
returns integer
language plpgsql
as $$
declare
  v_count integer;
  v_tz    text := 'Europe/Bucharest';
begin
  with orders_agg as (
    select
      assigned_courier_user_id as courier_user_id,
      count(*) filter (
        where status = 'DELIVERED' and (delivered_at at time zone v_tz)::date = target_date
      ) as deliveries_completed,
      coalesce(sum(delivery_fee_ron) filter (
        where status = 'DELIVERED' and (delivered_at at time zone v_tz)::date = target_date
      ), 0) as earnings_ron,
      count(*) filter (
        where status = 'CANCELLED' and (cancelled_at at time zone v_tz)::date = target_date
      ) as deliveries_cancelled
    from public.courier_orders
    where assigned_courier_user_id is not null
      and (
        (delivered_at at time zone v_tz)::date = target_date
        or (cancelled_at at time zone v_tz)::date = target_date
      )
    group by assigned_courier_user_id
  ),
  shifts_agg as (
    -- Clamp each shift to the target Bucharest day so a shift that spans
    -- midnight is split correctly and an open shift (ended_at null) on a PAST
    -- day is not counted up to the current now() during backfill/re-runs.
    select
      courier_user_id,
      round(sum(
        greatest(
          extract(epoch from (
            least(coalesce(ended_at, now()), ((target_date + 1)::timestamp) at time zone v_tz)
            - greatest(started_at, (target_date::timestamp) at time zone v_tz)
          )) / 60.0,
          0
        )
      ))::int as online_minutes
    from public.courier_shifts
    where started_at < ((target_date + 1)::timestamp) at time zone v_tz
      and coalesce(ended_at, now()) > (target_date::timestamp) at time zone v_tz
    group by courier_user_id
  ),
  ratings_agg as (
    select
      courier_user_id,
      round(avg(stars)::numeric, 2) as avg_rating,
      count(*)::int as ratings_count
    from public.delivery_ratings
    where courier_user_id is not null
      and (created_at at time zone v_tz)::date = target_date
    group by courier_user_id
  ),
  combo_agg as (
    select
      courier_user_id,
      count(*) filter (where (sent_at at time zone v_tz)::date = target_date)
        as combo_pushes_sent,
      count(*) filter (
        where accepted_at is not null and (accepted_at at time zone v_tz)::date = target_date
      ) as combo_pushes_accepted
    from public.courier_combo_pushes
    where (sent_at at time zone v_tz)::date = target_date
       or (accepted_at at time zone v_tz)::date = target_date
    group by courier_user_id
  ),
  all_couriers as (
    select courier_user_id from orders_agg
    union select courier_user_id from shifts_agg
    union select courier_user_id from ratings_agg
    union select courier_user_id from combo_agg
  ),
  upserted as (
    insert into public.courier_daily_kpis as k (
      courier_user_id, kpi_date, deliveries_completed, deliveries_cancelled,
      earnings_ron, online_minutes, avg_rating, ratings_count,
      combo_pushes_sent, combo_pushes_accepted, updated_at
    )
    select
      c.courier_user_id, target_date,
      coalesce(o.deliveries_completed, 0), coalesce(o.deliveries_cancelled, 0),
      coalesce(o.earnings_ron, 0), coalesce(s.online_minutes, 0),
      r.avg_rating, coalesce(r.ratings_count, 0),
      coalesce(cb.combo_pushes_sent, 0), coalesce(cb.combo_pushes_accepted, 0),
      now()
    from all_couriers c
    left join orders_agg o using (courier_user_id)
    left join shifts_agg s using (courier_user_id)
    left join ratings_agg r using (courier_user_id)
    left join combo_agg cb using (courier_user_id)
    on conflict (courier_user_id, kpi_date) do update set
      deliveries_completed  = excluded.deliveries_completed,
      deliveries_cancelled  = excluded.deliveries_cancelled,
      earnings_ron          = excluded.earnings_ron,
      online_minutes        = excluded.online_minutes,
      avg_rating            = excluded.avg_rating,
      ratings_count         = excluded.ratings_count,
      combo_pushes_sent     = excluded.combo_pushes_sent,
      combo_pushes_accepted = excluded.combo_pushes_accepted,
      updated_at            = now()
    returning 1
  )
  select count(*) into v_count from upserted;
  return v_count;
end;
$$;

comment on function public.rollup_courier_daily_kpis is
  'Upserts courier_daily_kpis for target_date from courier_orders / '
  'courier_shifts / delivery_ratings / courier_combo_pushes. Idempotent — safe '
  'to re-run for any day. Scheduled nightly via pg_cron (courier-kpi-rollup-daily).';

-- ── 7-day rolling "brain" surface ──────────────────────────────────────────
create or replace view public.v_courier_kpi_7d as
select
  k.courier_user_id,
  sum(k.deliveries_completed)::int as deliveries_7d,
  sum(k.deliveries_cancelled)::int as cancelled_7d,
  sum(k.earnings_ron) as earnings_7d,
  sum(k.online_minutes)::int as online_minutes_7d,
  round(avg(k.avg_rating) filter (where k.avg_rating is not null), 2) as avg_rating_7d,
  sum(k.combo_pushes_sent)::int as combo_sent_7d,
  sum(k.combo_pushes_accepted)::int as combo_accepted_7d,
  case
    when sum(k.deliveries_completed + k.deliveries_cancelled) > 0
    then round(
      sum(k.deliveries_completed)::numeric
        / sum(k.deliveries_completed + k.deliveries_cancelled), 3)
    else null
  end as completion_rate_7d
from public.courier_daily_kpis k
where k.kpi_date >= (now() at time zone 'Europe/Bucharest')::date - 6  -- today + prior 6 = 7 days
group by k.courier_user_id;

comment on view public.v_courier_kpi_7d is
  'Last-7-day rollup per courier. The queryable surface dispatch / allocation / '
  'Hepi read (via service role) to weight offers by recent performance.';

-- ── Nightly schedule (pg_cron) ─────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'courier-kpi-rollup-daily') then
    perform cron.schedule(
      'courier-kpi-rollup-daily',
      '20 1 * * *',  -- 01:20 UTC — rolls up the previous Bucharest day
      $cron$ select public.rollup_courier_daily_kpis(((now() at time zone 'Europe/Bucharest')::date - 1)); $cron$
    );
  end if;
end$$;

-- ── Backfill the last 8 days so the brain has data immediately ─────────────
do $$
declare
  d date;
begin
  for d in
    select generate_series(
      (now() at time zone 'Europe/Bucharest')::date - 7,
      (now() at time zone 'Europe/Bucharest')::date,
      interval '1 day'
    )::date
  loop
    perform public.rollup_courier_daily_kpis(d);
  end loop;
end$$;
