-- Flexible per-fleet courier settlement (decontare) — Faza 1.
--
-- Business model (Iulian, 2026-06-15):
--   • Each FLEET sets its own tariff for paying ITS couriers ("total flexibil,
--     fiecare flotă cum vrea ea, hibrid"). HIR only COMPUTES a settlement
--     report; the fleet pays the courier directly (bank transfer). HIR never
--     moves courier money — keeps the legal firewall intact.
--   • Hybrid tariff: a fleet can set ONE flat rate (zone_id NULL) that applies
--     everywhere — including zone-less cities — OR per-zone overrides on top.
--
-- What this migration adds:
--   A. fleet_courier_tariffs  — per-fleet, optionally per-zone payout rate
--                               (+ optional COD bonus), append-only with a
--                               valid_from/valid_until audit trail.
--   B. payout_items decoupling — a delivery can now be paid even when it has
--      no delivery_pricings row (zone-less city). Adds delivery_id + source,
--      makes delivery_pricing_id nullable.
--   C. fn_generate_courier_payout_periods(start, end) — turns DELIVERED orders
--      into payout_periods (PENDING) + payout_items, resolving each delivery's
--      amount via the fleet tariff (zone → flat → zone default → unrated).
--      Idempotent (a delivery is paid at most once) and NEVER mutates an
--      already APPROVED/PAID period.
--   D. Weekly pg_cron + a current-week wrapper the fleet UI calls on demand.
--
-- All additive + idempotent. Existing payout UI/state-machine/export are reused
-- unchanged (they already read amount + delivery_id null-tolerantly).

-- ════════════════════════════════════════════════════════════════════════════
-- A. fleet_courier_tariffs
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.fleet_courier_tariffs (
  id              uuid        primary key default gen_random_uuid(),
  fleet_id        uuid        not null references public.courier_fleets(id) on delete cascade,
  -- NULL zone_id = fleet-wide FLAT rate (applies to any zone, incl. zone-less
  -- cities). Non-null = per-zone override for this fleet.
  zone_id         uuid        references public.pricing_zones(id) on delete cascade,
  -- What the fleet pays its courier per delivery, in RON×100.
  payout_cents    int         not null check (payout_cents >= 0),
  -- Optional flat bonus added on COD deliveries (cash handling), RON×100.
  cod_bonus_cents int         not null default 0 check (cod_bonus_cents >= 0),
  valid_from      timestamptz not null default now(),
  -- NULL = currently active. A new rate sets the prior row's valid_until.
  valid_until     timestamptz,
  reason          text,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- One ACTIVE tariff per (fleet, zone-or-global). NULLS NOT DISTINCT (PG15+) so
-- two active flat rows (zone_id NULL) for the same fleet collide.
create unique index if not exists uq_fleet_courier_tariffs_active
  on public.fleet_courier_tariffs (fleet_id, zone_id)
  nulls not distinct
  where (valid_until is null);

create index if not exists idx_fleet_courier_tariffs_fleet
  on public.fleet_courier_tariffs (fleet_id, valid_until);

comment on table public.fleet_courier_tariffs is
  'Per-fleet courier payout tariff. zone_id NULL = flat rate for the whole fleet '
  '(works in zone-less cities); non-null = per-zone override. Append-only audit '
  'trail via valid_from/valid_until. Drives fn_generate_courier_payout_periods. '
  'HIR computes; the fleet pays the courier directly.';

alter table public.fleet_courier_tariffs enable row level security;

-- Fleet owner reads their own tariffs; writes go through service_role (server
-- actions already gate on fleet-manager context).
drop policy if exists "fleet_courier_tariffs_owner_select" on public.fleet_courier_tariffs;
create policy "fleet_courier_tariffs_owner_select"
  on public.fleet_courier_tariffs for select
  to authenticated
  using (
    fleet_id in (
      select id from public.courier_fleets where owner_user_id = auth.uid()
    )
  );

drop policy if exists "fleet_courier_tariffs_service_role_all" on public.fleet_courier_tariffs;
create policy "fleet_courier_tariffs_service_role_all"
  on public.fleet_courier_tariffs for all
  to service_role
  using (true)
  with check (true);

-- ════════════════════════════════════════════════════════════════════════════
-- B. payout_items — decouple from delivery_pricings (support zone-less cities)
-- ════════════════════════════════════════════════════════════════════════════
alter table public.payout_items
  add column if not exists delivery_id uuid references public.courier_orders(id) on delete restrict;

alter table public.payout_items
  add column if not exists source text;  -- fleet_zone | fleet_flat | zone_default | unrated

-- A delivery may be paid without a pricing row (zone-less city) → nullable.
alter table public.payout_items
  alter column delivery_pricing_id drop not null;

-- A delivery is paid at most once (idempotency arbiter for the generator).
create unique index if not exists uq_payout_items_delivery
  on public.payout_items (delivery_id);

-- The original unique(delivery_pricing_id) constraint predates the nullable
-- column. Now that delivery_pricing_id can be NULL (zone-less cities), drop the
-- whole-column constraint and re-express its real intent — "a pricing row maps
-- to at most one payout_item" — as a partial unique that ignores NULLs. The new
-- uq_payout_items_delivery is the actual idempotency arbiter.
alter table public.payout_items drop constraint if exists payout_items_unique_pricing;
create unique index if not exists uq_payout_items_pricing_nonnull
  on public.payout_items (delivery_pricing_id)
  where delivery_pricing_id is not null;

comment on column public.payout_items.delivery_id is
  'The courier_order this payout line pays for. Authoritative link (works even '
  'when delivery_pricing_id is NULL in zone-less cities).';
comment on column public.payout_items.source is
  'Which rate won: fleet_zone | fleet_flat | zone_default | unrated.';

-- ════════════════════════════════════════════════════════════════════════════
-- C. fn_generate_courier_payout_periods(start, end)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.fn_generate_courier_payout_periods(
  p_period_start timestamptz,
  p_period_end   timestamptz,
  p_fleet_id     uuid default null  -- null = all fleets (cron); set = one fleet (manual)
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_period_id     uuid;
  v_period_status text;
  v_amount        int;
  v_source        text;
  v_dp_id         uuid;
  v_dp_zone       uuid;
  v_dp_payout     int;
  v_fleet_payout  int;
  v_fleet_cod     int;
  v_touched       int := 0;
begin
  if p_period_end <= p_period_start then
    raise exception 'period_end must be after period_start';
  end if;

  -- DELIVERED, assigned, city-known orders in the window not yet paid.
  for v_rec in
    select co.id                         as delivery_id,
           co.assigned_courier_user_id   as courier_user_id,
           co.city_id,
           co.fleet_id,
           co.payment_method,
           co.delivered_at
      from public.courier_orders co
     where co.status = 'DELIVERED'
       and co.delivered_at >= p_period_start
       and co.delivered_at <  p_period_end
       and co.assigned_courier_user_id is not null
       and co.city_id is not null
       and (p_fleet_id is null or co.fleet_id = p_fleet_id)
       and not exists (
         select 1 from public.payout_items pi where pi.delivery_id = co.id
       )
     order by co.assigned_courier_user_id, co.delivered_at
  loop
    -- Latest pricing row for this delivery (may not exist in zone-less cities).
    v_dp_id := null; v_dp_zone := null; v_dp_payout := null;
    select dp.id, dp.zone_id, dp.courier_payout_cents
      into v_dp_id, v_dp_zone, v_dp_payout
      from public.delivery_pricings dp
     where dp.delivery_id = v_rec.delivery_id
     order by dp.computed_at desc
     limit 1;

    -- Resolve the fleet tariff: per-zone override first, then fleet-wide flat.
    v_fleet_payout := null; v_fleet_cod := 0; v_source := null;
    if v_rec.fleet_id is not null then
      if v_dp_zone is not null then
        select payout_cents, cod_bonus_cents
          into v_fleet_payout, v_fleet_cod
          from public.fleet_courier_tariffs
         where fleet_id = v_rec.fleet_id and zone_id = v_dp_zone and valid_until is null
         limit 1;
        if v_fleet_payout is not null then
          v_source := 'fleet_zone';
        end if;
      end if;
      if v_fleet_payout is null then
        select payout_cents, cod_bonus_cents
          into v_fleet_payout, v_fleet_cod
          from public.fleet_courier_tariffs
         where fleet_id = v_rec.fleet_id and zone_id is null and valid_until is null
         limit 1;
        if v_fleet_payout is not null then
          v_source := 'fleet_flat';
        end if;
      end if;
    end if;

    -- COD bonus is a FLEET-tariff concept, so it applies only when a fleet rate
    -- is used (zone defaults have no COD notion). source='unrated' (amount 0)
    -- means neither a fleet tariff nor a zone price matched — it is stored as a
    -- top-level column so the fleet UI can flag those deliveries for a rate.
    if v_fleet_payout is not null then
      v_amount := v_fleet_payout
        + case when v_rec.payment_method = 'COD' then coalesce(v_fleet_cod, 0) else 0 end;
    elsif v_dp_payout is not null then
      v_amount := v_dp_payout;
      v_source := 'zone_default';
    else
      v_amount := 0;
      v_source := 'unrated';
    end if;

    -- Upsert the courier's period for this window (one per courier+window).
    insert into public.payout_periods
      (courier_user_id, city_id, period_start, period_end, status)
    values
      (v_rec.courier_user_id, v_rec.city_id, p_period_start, p_period_end, 'PENDING')
    on conflict (courier_user_id, period_start, period_end) do nothing;

    -- FOR UPDATE serializes this generation against a concurrent approval or a
    -- second generation run: an APPROVE (FOR NO KEY UPDATE) or another
    -- generator blocks on this row until we commit, so the status we read here
    -- can't change under us and the end-of-run totals recompute stays consistent.
    select id, status
      into v_period_id, v_period_status
      from public.payout_periods
     where courier_user_id = v_rec.courier_user_id
       and period_start = p_period_start
       and period_end = p_period_end
     for update;

    -- Never add items to a period the manager already approved/paid.
    if v_period_status is distinct from 'PENDING' then
      continue;
    end if;

    insert into public.payout_items
      (payout_period_id, delivery_id, delivery_pricing_id, amount_cents, source, formula_snapshot)
    values
      (v_period_id, v_rec.delivery_id, v_dp_id, v_amount, v_source,
       jsonb_build_object(
         'source', v_source,
         'fleet_id', v_rec.fleet_id,
         'zone_id', v_dp_zone,
         'payment_method', v_rec.payment_method,
         'generated_by', 'fn_generate_courier_payout_periods'
       ))
    on conflict (delivery_id) do nothing;
  end loop;

  -- Recompute totals for every PENDING period in this window.
  with sums as (
    select pi.payout_period_id,
           coalesce(sum(pi.amount_cents), 0) as total_cents,
           count(*)                          as cnt
      from public.payout_items pi
      join public.payout_periods pp on pp.id = pi.payout_period_id
     where pp.period_start = p_period_start
       and pp.period_end = p_period_end
       and pp.status = 'PENDING'
     group by pi.payout_period_id
  ),
  updated as (
    update public.payout_periods pp
       set total_cents = s.total_cents,
           deliveries_count = s.cnt,
           updated_at = now()
      from sums s
     where pp.id = s.payout_period_id
    returning pp.id
  )
  select count(*) into v_touched from updated;

  return v_touched;
end;
$$;

comment on function public.fn_generate_courier_payout_periods(timestamptz, timestamptz) is
  'Generates courier payout_periods (PENDING) + payout_items from DELIVERED '
  'orders in [start,end). Amount per delivery = fleet tariff (zone override → '
  'fleet flat) else zone courier_payout_cents else 0 (unrated). Idempotent — a '
  'delivery is paid once; never mutates an APPROVED/PAID period. The fleet pays '
  'the courier; HIR only reports.';

-- date_trunc('week', <timestamp WITHOUT tz>) truncates the Bucharest wall-clock
-- value directly (no server-TZ involved), so the Monday is the Bucharest Monday;
-- re-stamping that date at Europe/Bucharest yields the correct absolute instant.

-- Prior full Bucharest week [last-Mon-7, last-Mon) — what the weekly cron settles
-- (all fleets).
create or replace function public.fn_generate_courier_payouts_prior_week()
returns integer
language sql
security definer
set search_path = public
as $$
  select public.fn_generate_courier_payout_periods(
    ((date_trunc('week', (now() at time zone 'Europe/Bucharest'))::date - 7)::timestamp)
      at time zone 'Europe/Bucharest',
    ((date_trunc('week', (now() at time zone 'Europe/Bucharest'))::date)::timestamp)
      at time zone 'Europe/Bucharest',
    null
  );
$$;

-- Current Bucharest week [this-Mon, next-Mon) for ONE fleet — the fleet UI's
-- "generate now". Stable bounds (re-running mid-week reuses the same period) and
-- fleet-scoped so a manager only ever generates their own fleet's settlement.
create or replace function public.fn_generate_courier_payouts_current_week_for_fleet(
  p_fleet_id uuid
)
returns integer
language sql
security definer
set search_path = public
as $$
  select public.fn_generate_courier_payout_periods(
    ((date_trunc('week', (now() at time zone 'Europe/Bucharest'))::date)::timestamp)
      at time zone 'Europe/Bucharest',
    ((date_trunc('week', (now() at time zone 'Europe/Bucharest'))::date + 7)::timestamp)
      at time zone 'Europe/Bucharest',
    p_fleet_id
  );
$$;

-- Locked down: only the cron (definer) + service_role (fleet server action) run these.
revoke all on function public.fn_generate_courier_payout_periods(timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.fn_generate_courier_payouts_prior_week() from public, anon, authenticated;
revoke all on function public.fn_generate_courier_payouts_current_week_for_fleet(uuid) from public, anon, authenticated;
grant execute on function public.fn_generate_courier_payouts_current_week_for_fleet(uuid) to service_role;
grant execute on function public.fn_generate_courier_payout_periods(timestamptz, timestamptz, uuid) to service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- D2. Atomic fleet flat-tariff set — expire prior active + insert new in ONE
--     transaction so a partial failure can never leave a fleet with no rate (or
--     two active rates under a concurrent double-submit).
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.fn_set_fleet_flat_tariff(
  p_fleet_id        uuid,
  p_payout_cents    int,
  p_cod_bonus_cents int,
  p_created_by      uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.fleet_courier_tariffs
     set valid_until = now()
   where fleet_id = p_fleet_id
     and zone_id is null
     and valid_until is null;

  insert into public.fleet_courier_tariffs
    (fleet_id, zone_id, payout_cents, cod_bonus_cents, reason, created_by)
  values
    (p_fleet_id, null, p_payout_cents, p_cod_bonus_cents,
     'Tarif flat setat de managerul flotei', p_created_by);
end;
$$;

revoke all on function public.fn_set_fleet_flat_tariff(uuid, int, int, uuid) from public, anon, authenticated;
grant execute on function public.fn_set_fleet_flat_tariff(uuid, int, int, uuid) to service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- D3. Weekly schedule (pg_cron) — Mondays 02:30 UTC settle the prior week.
--     Unschedule-then-schedule so a re-apply corrects any drift (idempotent).
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'courier-payout-rollup-weekly';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
  perform cron.schedule(
    'courier-payout-rollup-weekly',
    '30 2 * * 1',
    $cron$ select public.fn_generate_courier_payouts_prior_week(); $cron$
  );
end$$;
