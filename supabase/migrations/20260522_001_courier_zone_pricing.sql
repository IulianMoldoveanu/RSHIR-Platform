-- courier zone-based pricing schema
-- RFC — review by Iulian before merge (see PR description).
--
-- Business decision (2026-05-22):
--   Delivery price is owned by the CITY, not by the tenant or the fleet.
--   Brașov intra-city: 20 RON restaurant / 15 RON courier, flat anywhere in the city.
--   Extra-urban ring zones: 6 predefined zones, flat fee per ring, max 20 km.
--   Per-tenant override: schema + audit trail built; default OFF; UI ships separately.
--
-- Courier legal status: PFA/SRL (invoices HIR), CIM accepted, no civil/author rights.
--
-- All tables are additive and idempotent (IF NOT EXISTS, drop-and-recreate policies).
-- `cities` already exists (migration 20260506_011). This migration does NOT recreate it.


-- ── 1. delivery_zones ────────────────────────────────────────────────────────
-- One row per pricing ring within a city.
-- geometry JSONB accepts either:
--   { "type": "Polygon", "coordinates": [...] }  — GeoJSON polygon
--   { "type": "Circle",  "center": [lng, lat], "radius_m": 12000 }  — centre+radius
-- Full PostGIS support can be added in a follow-up migration once the exact
-- polygon boundaries are confirmed.

create table if not exists public.delivery_zones (
  id                   uuid        primary key default gen_random_uuid(),
  city_id              uuid        not null references public.cities(id) on delete restrict,
  name                 text        not null,
  zone_type            text        not null check (zone_type in ('URBAN', 'EXTRA_URBAN')),
  -- GeoJSON polygon or { type: "Circle", center: [lng,lat], radius_m: N }
  geometry             jsonb,
  max_distance_km      numeric(6,2),
  -- All money in RON cents to avoid float drift.
  restaurant_fee_cents int         not null,
  courier_payout_cents int         not null,
  active               boolean     not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- HIR margin can never be negative: restaurant pays at least as much as courier earns.
  constraint delivery_zones_margin_nonnegative
    check (restaurant_fee_cents >= courier_payout_cents)
);

create index if not exists idx_delivery_zones_city_active
  on public.delivery_zones (city_id, active);

comment on table public.delivery_zones is
  'Flat-fee pricing rings per city. Price ownership = city, not tenant or fleet. Writes restricted to service_role; reads open to all authenticated users.';
comment on column public.delivery_zones.geometry is
  'GeoJSON Polygon or HIR Circle { type, center:[lng,lat], radius_m }. Null while Iulian finalises polygon boundaries for extra-urban zones.';
comment on column public.delivery_zones.restaurant_fee_cents is
  'What the restaurant is charged per delivery, in RON×100.';
comment on column public.delivery_zones.courier_payout_cents is
  'What the courier earns per delivery, in RON×100. Always <= restaurant_fee_cents.';


-- ── 2. tenant_pricing_overrides ─────────────────────────────────────────────
-- Append-only audit log for per-tenant zone price overrides.
-- To change an override: insert a new row (new valid_from, previous row valid_until set by app).
-- NO UPDATE on this table is intentional — every change leaves a full audit trail.

create table if not exists public.tenant_pricing_overrides (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references public.tenants(id) on delete cascade,
  zone_id              uuid        not null references public.delivery_zones(id) on delete restrict,
  restaurant_fee_cents int         not null,
  courier_payout_cents int         not null,
  valid_from           timestamptz not null default now(),
  -- null = currently active; set by application when a newer override row is inserted.
  valid_until          timestamptz,
  reason               text        not null,
  -- auth.uid() of the platform admin who created this override.
  created_by           uuid        not null references auth.users(id) on delete restrict,
  created_at           timestamptz not null default now(),

  constraint tenant_pricing_overrides_margin_nonnegative
    check (restaurant_fee_cents >= courier_payout_cents)
);

create index if not exists idx_tenant_pricing_overrides_tenant_zone
  on public.tenant_pricing_overrides (tenant_id, zone_id, valid_from desc);

comment on table public.tenant_pricing_overrides is
  'Append-only audit log of per-tenant price exceptions. Never UPDATE — always INSERT a new row. UI ships in a separate PR; table defaults are OFF (no rows = zone pricing applies).';


-- ── 3. delivery_pricings ─────────────────────────────────────────────────────
-- One row per courier_order delivery pricing computation. Append-only.
-- repriced_from_id enables an audit chain if a delivery is repriced (e.g. support dispute).
-- hir_margin_cents is a GENERATED column so it is always consistent and never manually set.

create table if not exists public.delivery_pricings (
  id                   uuid        primary key default gen_random_uuid(),
  delivery_id          uuid        not null references public.courier_orders(id) on delete restrict,
  zone_id              uuid        not null references public.delivery_zones(id) on delete restrict,
  restaurant_fee_cents int         not null,
  courier_payout_cents int         not null,
  -- Always kept consistent by the DB; never set manually.
  hir_margin_cents     int         generated always as (restaurant_fee_cents - courier_payout_cents) stored,
  -- Full snapshot of inputs + override flag at computation time.
  -- Schema: { formula_version, zone_name, zone_type, override_id, override_active, computed_by }
  formula_snapshot     jsonb       not null,
  computed_at          timestamptz not null default now(),
  -- Self-reference for repricing audit chain. Null = original computation.
  repriced_from_id     uuid        references public.delivery_pricings(id) on delete set null,

  constraint delivery_pricings_margin_nonnegative
    check (restaurant_fee_cents >= courier_payout_cents)
);

create index if not exists idx_delivery_pricings_delivery_id
  on public.delivery_pricings (delivery_id, computed_at desc);

create index if not exists idx_delivery_pricings_zone_id
  on public.delivery_pricings (zone_id, computed_at desc);

comment on table public.delivery_pricings is
  'Append-only record of every pricing computation for a delivery. hir_margin_cents is a generated column. repriced_from_id chains repricings for support audits.';


-- ── 4. payout_periods ───────────────────────────────────────────────────────
-- One row per courier pay period. Couriers are identified by user_id (FK auth.users)
-- because that is the canonical courier identifier in this codebase (courier_profiles.user_id).

create table if not exists public.payout_periods (
  id               uuid        primary key default gen_random_uuid(),
  courier_user_id  uuid        not null references auth.users(id) on delete restrict,
  city_id          uuid        not null references public.cities(id) on delete restrict,
  period_start     timestamptz not null,
  period_end       timestamptz not null,
  status           text        not null default 'PENDING'
                               check (status in ('PENDING', 'APPROVED', 'PAID')),
  total_cents      int         not null default 0,
  deliveries_count int         not null default 0,
  paid_at          timestamptz,
  -- How the payment was made: BANK_TRANSFER, CASH, OTHER
  paid_method      text        check (paid_method in ('BANK_TRANSFER', 'CASH', 'OTHER')),
  -- External payment reference (OP number, receipt ID, etc.)
  payment_ref      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint payout_periods_dates_valid
    check (period_end > period_start),
  -- One open period per courier per time window.
  constraint payout_periods_unique_window
    unique (courier_user_id, period_start, period_end)
);

create index if not exists idx_payout_periods_courier_status
  on public.payout_periods (courier_user_id, status);

create index if not exists idx_payout_periods_city_status
  on public.payout_periods (city_id, status);

comment on table public.payout_periods is
  'Pay period per courier. Status state machine: PENDING → APPROVED → PAID. CourierId keyed by auth.users (courier_profiles.user_id) per codebase convention.';


-- ── 5. payout_items ──────────────────────────────────────────────────────────
-- One row per delivery inside a payout period. Append-only.
-- amount_cents = what the courier actually receives for this delivery.

create table if not exists public.payout_items (
  id                   uuid  primary key default gen_random_uuid(),
  payout_period_id     uuid  not null references public.payout_periods(id) on delete cascade,
  delivery_pricing_id  uuid  not null references public.delivery_pricings(id) on delete restrict,
  amount_cents         int   not null,
  -- Snapshot of formula inputs at time of item creation (mirrors delivery_pricings.formula_snapshot
  -- but may include payout-period-specific adjustments like bonus/deduction).
  formula_snapshot     jsonb not null,

  -- A delivery_pricing row can appear in at most one payout_item.
  constraint payout_items_unique_pricing
    unique (delivery_pricing_id)
);

create index if not exists idx_payout_items_period
  on public.payout_items (payout_period_id);

comment on table public.payout_items is
  'One row per delivery inside a payout period. Append-only. formula_snapshot captures any period-level adjustments applied on top of delivery_pricings.formula_snapshot.';


-- ── 6. RLS ───────────────────────────────────────────────────────────────────

alter table public.delivery_zones         enable row level security;
alter table public.tenant_pricing_overrides enable row level security;
alter table public.delivery_pricings      enable row level security;
alter table public.payout_periods         enable row level security;
alter table public.payout_items           enable row level security;

-- delivery_zones: read by all authenticated; writes via service_role only.
drop policy if exists "delivery_zones_authenticated_select" on public.delivery_zones;
create policy "delivery_zones_authenticated_select"
  on public.delivery_zones for select
  to anon, authenticated
  using (true);

drop policy if exists "delivery_zones_service_role_all" on public.delivery_zones;
create policy "delivery_zones_service_role_all"
  on public.delivery_zones for all
  to service_role
  using (true)
  with check (true);

-- tenant_pricing_overrides: tenant sees their own overrides; service_role manages.
drop policy if exists "tenant_pricing_overrides_tenant_select" on public.tenant_pricing_overrides;
create policy "tenant_pricing_overrides_tenant_select"
  on public.tenant_pricing_overrides for select
  to authenticated
  using (
    tenant_id in (
      select tenant_id from public.tenant_members where user_id = auth.uid()
    )
  );

drop policy if exists "tenant_pricing_overrides_service_role_all" on public.tenant_pricing_overrides;
create policy "tenant_pricing_overrides_service_role_all"
  on public.tenant_pricing_overrides for all
  to service_role
  using (true)
  with check (true);

-- delivery_pricings: visible to the source tenant and the assigned courier.
drop policy if exists "delivery_pricings_tenant_or_courier_select" on public.delivery_pricings;
create policy "delivery_pricings_tenant_or_courier_select"
  on public.delivery_pricings for select
  to authenticated
  using (
    -- Tenant member can see pricings for their deliveries.
    delivery_id in (
      select id from public.courier_orders
       where source_tenant_id in (
         select tenant_id from public.tenant_members where user_id = auth.uid()
       )
    )
    or
    -- Assigned courier can see their own delivery pricings.
    delivery_id in (
      select id from public.courier_orders
       where assigned_courier_user_id = auth.uid()
    )
  );

drop policy if exists "delivery_pricings_service_role_all" on public.delivery_pricings;
create policy "delivery_pricings_service_role_all"
  on public.delivery_pricings for all
  to service_role
  using (true)
  with check (true);

-- payout_periods: courier sees their own; service_role manages.
drop policy if exists "payout_periods_courier_select" on public.payout_periods;
create policy "payout_periods_courier_select"
  on public.payout_periods for select
  to authenticated
  using (courier_user_id = auth.uid());

drop policy if exists "payout_periods_service_role_all" on public.payout_periods;
create policy "payout_periods_service_role_all"
  on public.payout_periods for all
  to service_role
  using (true)
  with check (true);

-- payout_items: courier sees items in their own periods.
drop policy if exists "payout_items_courier_select" on public.payout_items;
create policy "payout_items_courier_select"
  on public.payout_items for select
  to authenticated
  using (
    payout_period_id in (
      select id from public.payout_periods where courier_user_id = auth.uid()
    )
  );

drop policy if exists "payout_items_service_role_all" on public.payout_items;
create policy "payout_items_service_role_all"
  on public.payout_items for all
  to service_role
  using (true)
  with check (true);


-- ── 7. Seed — Brașov zones ───────────────────────────────────────────────────
-- Runs only if the Brașov city row already exists (idempotent via ON CONFLICT DO NOTHING).
-- Extra-urban zone prices are set to 0/0 as TODO placeholders — Iulian fills them from the admin UI.

do $$
declare
  v_brasov_id uuid;
begin
  select id into v_brasov_id from public.cities where slug = 'brasov';

  if v_brasov_id is null then
    raise notice 'Brașov city row not found — skipping zone seed. Run 20260506_011 first.';
    return;
  end if;

  -- ── Intra-city zone ────────────────────────────────────────────────────
  -- Approximate bounding polygon for the Brașov municipality administrative area.
  -- Replace with exact polygon from primărie GIS data before going live.
  insert into public.delivery_zones
    (city_id, name, zone_type, geometry, max_distance_km, restaurant_fee_cents, courier_payout_cents)
  values (
    v_brasov_id,
    'Brașov - intra-oraș',
    'URBAN',
    '{
      "type": "Polygon",
      "coordinates": [[
        [25.5300, 45.6000],
        [25.6500, 45.6000],
        [25.6500, 45.6800],
        [25.5300, 45.6800],
        [25.5300, 45.6000]
      ]]
    }'::jsonb,
    null,
    2000,
    1500
  )
  on conflict do nothing;

  -- ── Extra-urban ring zones — prices TODO ────────────────────────────────
  -- restaurant_fee_cents and courier_payout_cents are 0 (placeholder).
  -- Iulian will set final values from the admin UI before activating these zones.
  -- Geometry = approximate circle centred on each locality.

  insert into public.delivery_zones
    (city_id, name, zone_type, geometry, max_distance_km, restaurant_fee_cents, courier_payout_cents, active)
  values
    (v_brasov_id, 'Brașov - Săcele',   'EXTRA_URBAN',
      '{"type":"Circle","center":[25.6992,45.6132],"radius_m":5000}'::jsonb,  12, 0, 0, false),
    (v_brasov_id, 'Brașov - Codlea',   'EXTRA_URBAN',
      '{"type":"Circle","center":[25.4475,45.7037],"radius_m":4000}'::jsonb,  15, 0, 0, false),
    (v_brasov_id, 'Brașov - Cristian', 'EXTRA_URBAN',
      '{"type":"Circle","center":[25.4961,45.7386],"radius_m":3000}'::jsonb,  10, 0, 0, false),
    (v_brasov_id, 'Brașov - Sânpetru', 'EXTRA_URBAN',
      '{"type":"Circle","center":[25.6500,45.6550],"radius_m":3000}'::jsonb,   8, 0, 0, false),
    (v_brasov_id, 'Brașov - Hărman',   'EXTRA_URBAN',
      '{"type":"Circle","center":[25.6658,45.6908],"radius_m":3500}'::jsonb,  11, 0, 0, false),
    (v_brasov_id, 'Brașov - Predeal/Râșnov', 'EXTRA_URBAN',
      '{"type":"Circle","center":[25.4549,45.5081],"radius_m":6000}'::jsonb,  20, 0, 0, false)
  on conflict do nothing;

end;
$$;
