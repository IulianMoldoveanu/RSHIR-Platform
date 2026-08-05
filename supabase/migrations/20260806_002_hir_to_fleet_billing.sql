-- ============================================================================
-- What HIR pays the fleet — the layer that did not exist.
--
-- Until now the schema knew exactly one delivery price chain: what a FLEET
-- pays its COURIER (fleet_courier_tariffs -> payout_periods/payout_items), and
-- what a fleet charges vendors directly (fleet_vendor_tariffs). There was no
-- table anywhere for what HIR owes a fleet. That number lived in conversation.
--
-- TWO LAYERS, DELIBERATELY DIFFERENT SHAPES
--   HIR -> fleet : a fixed price per delivery, negotiated per fleet.
--   fleet -> courier : whatever the fleet chooses, including per km.
--
--   Not a rounding detail — it is where the distance risk sits. If HIR also
--   paid per measured kilometre, HIR's cost would follow whichever route the
--   courier happened to take, and HIR would be paying for detours it has no
--   way to see. Fixed per delivery puts that risk on the fleet, which is the
--   party that can actually manage it: routing well is how the fleet earns
--   its margin, and the margin stays the fleet's own business — invisible to
--   its couriers, which is what makes the arrangement work commercially.
--
--   It is also the line that keeps HIR a customer of the fleet rather than an
--   employer of its riders: HIR buys deliveries at a B2B price and holds no
--   opinion about what a courier is paid. Charging couriers directly, or
--   setting their rate and letting the fleet keep a cut, would put HIR in
--   charge of courier pay — the exact signal that reclassifies a platform
--   under Directive (EU) 2024/2831.
--
-- SCOPE
--   city_id is nullable and NULL means "this fleet, anywhere" — the same
--   NULL-means-everything convention fleet_courier_tariffs uses for zone_id.
--   Today the rate is negotiated per fleet; a per-city rate later is a row,
--   not a migration.
--
-- Everything here mirrors the courier payout chain on purpose: same period
-- states, same one-line-per-delivery idempotency, same refusal to touch an
-- approved period. Two reports, one shape to learn.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The rate.
-- ---------------------------------------------------------------------------
create table if not exists public.fleet_billing_tariffs (
  id                 uuid        primary key default gen_random_uuid(),
  fleet_id           uuid        not null references public.courier_fleets(id) on delete cascade,
  -- NULL = applies to the whole fleet. A city row overrides it.
  city_id            uuid        references public.cities(id) on delete cascade,
  per_delivery_cents int         not null check (per_delivery_cents >= 0 and per_delivery_cents <= 1000000),
  -- NULL = currently active. Setting a new rate closes the previous one.
  valid_from         timestamptz not null default now(),
  valid_until        timestamptz,
  reason             text,
  created_by         uuid        references auth.users(id),
  created_at         timestamptz not null default now(),
  is_financial_record boolean    not null default true
);

comment on table public.fleet_billing_tariffs is
  'What HIR pays a fleet per delivered order. Fixed per delivery — the fleet '
  'carries the distance risk and keeps the spread against what it pays its '
  'couriers. NULL city_id = fleet-wide; a city row overrides it. Versioned '
  'through valid_from/valid_until; rows are never edited in place.';

comment on column public.fleet_billing_tariffs.per_delivery_cents is
  'RON cents HIR owes the fleet for one delivered order. Deliberately not per '
  'km: HIR must not pay for a detour it cannot see.';

-- One live rate per scope. Two partial indexes because NULLs are distinct in
-- a unique index, so a single index would happily allow ten fleet-wide rows.
create unique index if not exists uq_fleet_billing_tariffs_active_fleet
  on public.fleet_billing_tariffs (fleet_id)
  where valid_until is null and city_id is null;

create unique index if not exists uq_fleet_billing_tariffs_active_city
  on public.fleet_billing_tariffs (fleet_id, city_id)
  where valid_until is null and city_id is not null;

create index if not exists idx_fleet_billing_tariffs_fleet
  on public.fleet_billing_tariffs (fleet_id, valid_from desc);

-- ---------------------------------------------------------------------------
-- 2. The invoice period + its lines.
-- ---------------------------------------------------------------------------
create table if not exists public.fleet_invoice_periods (
  id               uuid        primary key default gen_random_uuid(),
  fleet_id         uuid        not null references public.courier_fleets(id) on delete restrict,
  period_start     timestamptz not null,
  period_end       timestamptz not null,
  status           text        not null default 'PENDING'
                               check (status in ('PENDING', 'APPROVED', 'PAID')),
  total_cents      int         not null default 0,
  deliveries_count int         not null default 0,
  paid_at          timestamptz,
  paid_method      text        check (paid_method in ('BANK_TRANSFER', 'CASH', 'OTHER')),
  payment_ref      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  is_financial_record boolean  not null default true,

  constraint fleet_invoice_periods_dates_valid check (period_end > period_start),
  constraint fleet_invoice_periods_unique_window unique (fleet_id, period_start, period_end)
);

comment on table public.fleet_invoice_periods is
  'One HIR->fleet settlement window. PENDING while it can still take lines; '
  'APPROVED and PAID are closed to the generator. Mirrors payout_periods so '
  'the two reports read the same way.';

create table if not exists public.fleet_invoice_items (
  id                uuid        primary key default gen_random_uuid(),
  invoice_period_id uuid        not null references public.fleet_invoice_periods(id) on delete cascade,
  delivery_id       uuid        not null references public.courier_orders(id) on delete restrict,
  amount_cents      int         not null,
  -- fleet_city | fleet_flat | unrated
  source            text,
  formula_snapshot  jsonb,
  created_at        timestamptz not null default now(),
  is_financial_record boolean   not null default true
);

comment on table public.fleet_invoice_items is
  'One line per delivered order HIR owes the fleet for. The unique index on '
  'delivery_id is the idempotency arbiter: an order is invoiced once, however '
  'many times the generator runs.';

comment on column public.fleet_invoice_items.source is
  'Which rate won: fleet_city | fleet_flat | unrated (no rate on file — the '
  'line is written at 0 so the delivery is visible instead of missing).';

create unique index if not exists uq_fleet_invoice_items_delivery
  on public.fleet_invoice_items (delivery_id);

create index if not exists idx_fleet_invoice_items_period
  on public.fleet_invoice_items (invoice_period_id);

-- ---------------------------------------------------------------------------
-- 3. The generator.
-- ---------------------------------------------------------------------------
create or replace function public.fn_generate_fleet_invoice_periods(
  p_period_start timestamptz,
  p_period_end   timestamptz,
  p_fleet_id     uuid default null  -- null = every fleet
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec           record;
  v_period_id     uuid;
  v_period_status text;
  v_rate          int;
  v_source        text;
  v_scope_city    uuid;
  v_touched       int := 0;
begin
  if p_period_end <= p_period_start then
    raise exception 'period_end must be after period_start';
  end if;

  for v_rec in
    select co.id as delivery_id, co.fleet_id, co.city_id, co.delivered_at
      from public.courier_orders co
     where co.status = 'DELIVERED'
       and co.delivered_at >= p_period_start
       and co.delivered_at <  p_period_end
       and co.fleet_id is not null
       and (p_fleet_id is null or co.fleet_id = p_fleet_id)
       and not exists (
         select 1 from public.fleet_invoice_items fi where fi.delivery_id = co.id
       )
     order by co.fleet_id, co.delivered_at
  loop
    -- City rate first, then the fleet-wide one — each as it stood WHEN THE
    -- DELIVERY HAPPENED, not as it stands now. Rates are versioned precisely so
    -- that renegotiating today cannot reprice a week that already closed: pick
    -- the row whose validity interval contains delivered_at (Codex P1, #1064).
    v_rate := null; v_source := null; v_scope_city := null;
    if v_rec.city_id is not null then
      select per_delivery_cents, city_id
        into v_rate, v_scope_city
        from public.fleet_billing_tariffs
       where fleet_id = v_rec.fleet_id
         and city_id = v_rec.city_id
         and valid_from <= v_rec.delivered_at
         and (valid_until is null or valid_until > v_rec.delivered_at)
       order by valid_from desc
       limit 1;
      if v_rate is not null then
        v_source := 'fleet_city';
      end if;
    end if;

    if v_rate is null then
      select per_delivery_cents
        into v_rate
        from public.fleet_billing_tariffs
       where fleet_id = v_rec.fleet_id
         and city_id is null
         and valid_from <= v_rec.delivered_at
         and (valid_until is null or valid_until > v_rec.delivered_at)
       order by valid_from desc
       limit 1;
      if v_rate is not null then
        v_source := 'fleet_flat';
        v_scope_city := null;
      end if;
    end if;

    -- No rate on file. Write the line at zero rather than skip it: a missing
    -- rate is something to see and fix, and a skipped delivery would be
    -- invisible until someone reconciled by hand.
    if v_rate is null then
      v_rate := 0;
      v_source := 'unrated';
    end if;

    insert into public.fleet_invoice_periods
      (fleet_id, period_start, period_end, status)
    values
      (v_rec.fleet_id, p_period_start, p_period_end, 'PENDING')
    on conflict (fleet_id, period_start, period_end) do nothing;

    -- Same serialization the courier payout uses: an approval in flight blocks
    -- here until it commits, so the status read below cannot go stale.
    select id, status
      into v_period_id, v_period_status
      from public.fleet_invoice_periods
     where fleet_id = v_rec.fleet_id
       and period_start = p_period_start
       and period_end = p_period_end
     for update;

    if v_period_status is distinct from 'PENDING' then
      continue;
    end if;

    insert into public.fleet_invoice_items
      (invoice_period_id, delivery_id, amount_cents, source, formula_snapshot)
    values
      (v_period_id, v_rec.delivery_id, v_rate, v_source,
       jsonb_build_object(
         'source', v_source,
         'fleet_id', v_rec.fleet_id,
         'city_id', v_rec.city_id,
         'rate_scope_city_id', v_scope_city,
         'per_delivery_cents', v_rate,
         'generated_by', 'fn_generate_fleet_invoice_periods'
       ))
    on conflict (delivery_id) do nothing;
  end loop;

  with sums as (
    select fi.invoice_period_id,
           coalesce(sum(fi.amount_cents), 0) as total_cents,
           count(*)                          as cnt
      from public.fleet_invoice_items fi
      join public.fleet_invoice_periods fp on fp.id = fi.invoice_period_id
     where fp.period_start = p_period_start
       and fp.period_end = p_period_end
       and fp.status = 'PENDING'
       and (p_fleet_id is null or fp.fleet_id = p_fleet_id)
     group by fi.invoice_period_id
  ),
  updated as (
    update public.fleet_invoice_periods fp
       set total_cents = s.total_cents,
           deliveries_count = s.cnt,
           updated_at = now()
      from sums s
     where fp.id = s.invoice_period_id
    returning fp.id
  )
  select count(*) into v_touched from updated;

  return v_touched;
end;
$$;

comment on function public.fn_generate_fleet_invoice_periods(timestamptz, timestamptz, uuid) is
  'Generates HIR->fleet invoice periods (PENDING) + one line per DELIVERED '
  'order in [start,end). Rate = city override, else fleet-wide, else 0 marked '
  'unrated. Idempotent — a delivery is invoiced once; never mutates an '
  'APPROVED/PAID period. Counterpart of fn_generate_courier_payout_periods, '
  'which settles the other side of the same delivery.';

revoke execute on function public.fn_generate_fleet_invoice_periods(timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
-- Supabase's default privileges already name service_role, so the revoke above
-- does not touch it (checked: the RPC returns 200 through the service key).
-- Granting explicitly anyway, so the app's only path in is written down rather
-- than inherited from a platform default that could change.
grant execute on function public.fn_generate_fleet_invoice_periods(timestamptz, timestamptz, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3b. The weekly window, defined once.
--
-- The invoice and the courier payout settle the two sides of the same
-- delivery, so their week boundaries have to be the same boundary — not two
-- implementations that agree most of the time. A Bucharest Monday is 21:00 UTC
-- in summer and 22:00 in winter, so anything computed in UTC puts the first
-- hours of local Monday in a different week from the payout cron and the two
-- reports stop reconciling (Codex P2, #1064).
--
-- Hence: the same date_trunc expression fn_generate_courier_payouts_prior_week
-- uses, character for character, rather than a second version of the same idea
-- in application code.
-- ---------------------------------------------------------------------------
create or replace function public.fn_generate_fleet_invoice_prior_week(
  p_weeks_ago integer default 1,
  p_fleet_id  uuid default null
)
returns integer
language sql
security definer
set search_path = public
as $$
  select public.fn_generate_fleet_invoice_periods(
    ((date_trunc('week', (now() at time zone 'Europe/Bucharest'))::date
        - (7 * greatest(p_weeks_ago, 1)))::timestamp) at time zone 'Europe/Bucharest',
    ((date_trunc('week', (now() at time zone 'Europe/Bucharest'))::date
        - (7 * (greatest(p_weeks_ago, 1) - 1)))::timestamp) at time zone 'Europe/Bucharest',
    p_fleet_id
  );
$$;

comment on function public.fn_generate_fleet_invoice_prior_week(integer, uuid) is
  'Invoices a closed Bucharest week: 1 = the week that just ended. Shares its '
  'boundary expression with fn_generate_courier_payouts_prior_week so an '
  'invoice and a courier payout can be compared line for line.';

revoke execute on function public.fn_generate_fleet_invoice_prior_week(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_generate_fleet_invoice_prior_week(integer, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Who may read this.
--
-- A fleet sees what it is owed and at what rate. Nobody but the service role
-- writes: the rate is negotiated, not self-served, and the invoice lines are
-- generated. HIR-side staff reach these through the admin client.
-- ---------------------------------------------------------------------------
alter table public.fleet_billing_tariffs  enable row level security;
alter table public.fleet_invoice_periods  enable row level security;
alter table public.fleet_invoice_items    enable row level security;

drop policy if exists fleet_billing_tariffs_owner_read on public.fleet_billing_tariffs;
create policy fleet_billing_tariffs_owner_read
  on public.fleet_billing_tariffs
  for select
  to authenticated
  using (
    fleet_id in (select id from public.courier_fleets where owner_user_id = auth.uid())
  );

drop policy if exists fleet_invoice_periods_owner_read on public.fleet_invoice_periods;
create policy fleet_invoice_periods_owner_read
  on public.fleet_invoice_periods
  for select
  to authenticated
  using (
    fleet_id in (select id from public.courier_fleets where owner_user_id = auth.uid())
  );

drop policy if exists fleet_invoice_items_owner_read on public.fleet_invoice_items;
create policy fleet_invoice_items_owner_read
  on public.fleet_invoice_items
  for select
  to authenticated
  using (
    invoice_period_id in (
      select fp.id from public.fleet_invoice_periods fp
       where fp.fleet_id in (
         select id from public.courier_fleets where owner_user_id = auth.uid()
       )
    )
  );

grant select on public.fleet_billing_tariffs to authenticated;
grant select on public.fleet_invoice_periods to authenticated;
grant select on public.fleet_invoice_items   to authenticated;

revoke all on public.fleet_billing_tariffs from anon;
revoke all on public.fleet_invoice_periods from anon;
revoke all on public.fleet_invoice_items   from anon;
