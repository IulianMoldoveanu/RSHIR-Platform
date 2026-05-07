-- Lane FLEET-ALLOCATION-MVP — schema V1.
--
-- Implements the demand-supply matching algorithm per
-- decision_fleet_allocation_2026-05-07.md (replaces visibility-tier proposal,
-- which Iulian explicitly rejected — "treaba cu vizibility tier nu e buna").
--
-- Goal: model who delivers for whom, with capacity-aware allocation. Iulian
-- (platform admin) decides allocations in V1; the algorithm only RECOMMENDS.
-- Restaurants do not pick fleets in V1.
--
-- All changes are ADDITIVE + IDEMPOTENT. No existing rows or columns are
-- mutated; existing courier dispatch flows keep working unchanged.
--
-- Confidentiality reminder: "fleet" / "Fleet Network" stays internal. None
-- of these tables are surfaced to merchants — they remain platform-admin
-- + fleet-OWNER scoped.

-- ────────────────────────────────────────────────────────────────────────
-- 1. courier_fleets — add delivery-app routing columns
--
-- Per Iulian feedback: a fleet may run its own dispatch app (Bringo /
-- Bolt-Fleet / proprietary). HIR pushes orders via webhook (mirroring the
-- Custom HTTPS adapter pattern from PR #320) and the fleet reports status
-- back. Default 'hir' = current behaviour, dispatch through the in-app
-- courier feed.
-- ────────────────────────────────────────────────────────────────────────
alter table public.courier_fleets
  add column if not exists delivery_app text not null default 'hir';

alter table public.courier_fleets
  drop constraint if exists courier_fleets_delivery_app_chk;

alter table public.courier_fleets
  add constraint courier_fleets_delivery_app_chk
  check (delivery_app in ('hir', 'external'));

alter table public.courier_fleets
  add column if not exists webhook_url text;

alter table public.courier_fleets
  add column if not exists webhook_secret text;

-- Belt-and-suspenders: 'external' delivery_app requires URL+secret pair.
-- Tenants-level external_dispatch_* (migration 20260506_001) carries the
-- per-tenant override; this column lets a fleet declare globally that
-- they own the courier app, so the platform-admin UI can flag the
-- difference and Iulian doesn't accidentally allocate orders into a
-- "ghost fleet" with no app behind it.
alter table public.courier_fleets
  drop constraint if exists courier_fleets_external_requires_url_chk;

alter table public.courier_fleets
  add constraint courier_fleets_external_requires_url_chk
  check (
    delivery_app = 'hir'
    or (webhook_url is not null and webhook_secret is not null)
  );

comment on column public.courier_fleets.delivery_app is
  'Internal-only. ''hir'' = fleet uses HIR courier app (default). ''external'' = fleet runs own dispatch system; HIR forwards orders via webhook (Custom HTTPS adapter pattern). Never displayed to merchants.';

comment on column public.courier_fleets.webhook_url is
  'Internal-only. Required when delivery_app=''external''. HMAC-signed POST endpoint for outbound dispatch. Different from per-tenant external_dispatch_webhook_url.';

comment on column public.courier_fleets.webhook_secret is
  'Internal-only. HMAC-SHA256 shared secret. Required when delivery_app=''external''.';

-- ────────────────────────────────────────────────────────────────────────
-- 2. fleet_zones — operational zones a fleet covers
--
-- One row per (fleet, zone) pair. polygon is GeoJSON (matches the existing
-- delivery_zones.polygon convention — no PostGIS dependency). target_orders
-- _per_hour defaults to 4 (industry-profitable midpoint of the [3,5]
-- utilisation band Iulian named).
-- ────────────────────────────────────────────────────────────────────────
create table if not exists public.fleet_zones (
  id uuid primary key default gen_random_uuid(),
  fleet_id uuid not null references public.courier_fleets(id) on delete cascade,
  city_id uuid references public.cities(id) on delete set null,
  name text not null,
  polygon jsonb not null,
  capacity_courier_count int not null default 0
    check (capacity_courier_count >= 0),
  target_orders_per_hour int not null default 4
    check (target_orders_per_hour between 1 and 20),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fleet_zones_fleet on public.fleet_zones(fleet_id);
create index if not exists idx_fleet_zones_city  on public.fleet_zones(city_id) where city_id is not null;
create index if not exists idx_fleet_zones_active on public.fleet_zones(is_active);

comment on table public.fleet_zones is
  'Operational coverage zones per fleet. Used by allocation algorithm to estimate capacity (courier_count × target_orders_per_hour). Internal-only; merchants never see fleet identity.';

-- ────────────────────────────────────────────────────────────────────────
-- 3. fleet_restaurant_assignments — who delivers for whom
--
-- One row per (restaurant, fleet, role). role='primary' = first-pick fleet.
-- role='secondary' = fallback when primary refuses (no courier available).
-- A restaurant can have at most ONE active primary at a time, but multiple
-- secondaries are allowed (V2: ranked fallback chain).
-- ────────────────────────────────────────────────────────────────────────
create table if not exists public.fleet_restaurant_assignments (
  id uuid primary key default gen_random_uuid(),
  fleet_id uuid not null references public.courier_fleets(id) on delete cascade,
  restaurant_tenant_id uuid not null references public.tenants(id) on delete cascade,
  role text not null,
  status text not null default 'active',
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  paused_at timestamptz,
  terminated_at timestamptz,
  last_strike_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fleet_restaurant_assignments
  drop constraint if exists fra_role_chk;

alter table public.fleet_restaurant_assignments
  add constraint fra_role_chk
  check (role in ('primary', 'secondary'));

alter table public.fleet_restaurant_assignments
  drop constraint if exists fra_status_chk;

alter table public.fleet_restaurant_assignments
  add constraint fra_status_chk
  check (status in ('active', 'paused', 'terminated'));

-- One ACTIVE primary per restaurant. Secondary may stack (no constraint —
-- ranking is application-side via assigned_at desc until V2). Partial
-- unique index = doesn't block paused/terminated history rows.
create unique index if not exists fra_one_active_primary_per_restaurant
  on public.fleet_restaurant_assignments(restaurant_tenant_id)
  where role = 'primary' and status = 'active';

-- Idempotency for the typical "set primary X for restaurant Y" upsert: at
-- most one (fleet,restaurant,role) tuple may exist regardless of status,
-- so re-assignment goes through the existing row (status flip).
create unique index if not exists fra_unique_fleet_restaurant_role
  on public.fleet_restaurant_assignments(fleet_id, restaurant_tenant_id, role);

create index if not exists idx_fra_fleet_active
  on public.fleet_restaurant_assignments(fleet_id, status)
  where status = 'active';

create index if not exists idx_fra_restaurant_active
  on public.fleet_restaurant_assignments(restaurant_tenant_id, status)
  where status = 'active';

comment on table public.fleet_restaurant_assignments is
  'Maps a restaurant tenant to its delivering fleet (primary + secondary fallback). V1: writes are platform-admin-only. Restaurants see read-only view. Confidentiality: row contents never appear in merchant-facing surfaces — merchants only see "curier HIR".';

-- ────────────────────────────────────────────────────────────────────────
-- 4. fleet_demand_estimates — per (city, day_of_week, hour)
--
-- V1 source = 'manual' (Iulian) or 'self_estimate' (restaurant onboarding
-- forecast). V2 source = 'auto' (computed from rolling 30-day order
-- history once a city has 30+ live tenants).
--
-- One row per (city_id, day_of_week, hour, source, tenant_id-or-null) so
-- self-estimates accumulate without overwriting Iulian's manual values.
-- The algorithm sums them per (city, day, hour) at read time.
-- ────────────────────────────────────────────────────────────────────────
create table if not exists public.fleet_demand_estimates (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  zone_polygon jsonb,
  day_of_week int not null check (day_of_week between 0 and 6),
  hour int not null check (hour between 0 and 23),
  estimated_orders int not null check (estimated_orders >= 0),
  source text not null default 'manual',
  tenant_id uuid references public.tenants(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fleet_demand_estimates
  drop constraint if exists fde_source_chk;

alter table public.fleet_demand_estimates
  add constraint fde_source_chk
  check (source in ('manual', 'auto', 'self_estimate'));

-- A self_estimate is anchored to the tenant who reported it; manual/auto
-- carry tenant_id=null (city-level aggregate).
alter table public.fleet_demand_estimates
  drop constraint if exists fde_self_estimate_requires_tenant_chk;

alter table public.fleet_demand_estimates
  add constraint fde_self_estimate_requires_tenant_chk
  check (
    (source = 'self_estimate' and tenant_id is not null)
    or (source in ('manual', 'auto') and tenant_id is null)
  );

create unique index if not exists fde_unique_city_dow_hour_source_tenant
  on public.fleet_demand_estimates(city_id, day_of_week, hour, source, coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists idx_fde_city_lookup
  on public.fleet_demand_estimates(city_id, day_of_week, hour);

comment on table public.fleet_demand_estimates is
  'Demand forecast inputs for the fleet allocation algorithm. V1 manual + self_estimate; V2 auto from order history. Internal-only.';

-- ────────────────────────────────────────────────────────────────────────
-- 5. fleet_strikes — partner-pairing reliability log
--
-- Triggered when a fleet refuses a dispatched order (no courier, repeated
-- timeout, etc.). 5+ strikes / 30 days for the same (fleet, restaurant)
-- pair = application auto-pauses the assignment and surfaces a banner in
-- the platform-admin grid.
-- ────────────────────────────────────────────────────────────────────────
create table if not exists public.fleet_strikes (
  id uuid primary key default gen_random_uuid(),
  fleet_id uuid not null references public.courier_fleets(id) on delete cascade,
  restaurant_tenant_id uuid not null references public.tenants(id) on delete cascade,
  assignment_id uuid references public.fleet_restaurant_assignments(id) on delete set null,
  reason text not null,
  reported_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_fleet_strikes_pair_recent
  on public.fleet_strikes(fleet_id, restaurant_tenant_id, occurred_at desc);

create index if not exists idx_fleet_strikes_assignment
  on public.fleet_strikes(assignment_id) where assignment_id is not null;

comment on table public.fleet_strikes is
  'Reliability incidents for fleet-restaurant pairings. 5+ strikes/30 days triggers auto-pause of the assignment. Internal-only.';

-- ────────────────────────────────────────────────────────────────────────
-- 6. RLS — all new tables
--
-- Pattern: platform admin (service_role bypass via createAdminClient + the
-- existing HIR_PLATFORM_ADMIN_EMAILS allow-list in app code) reads/writes
-- everything. Fleet OWNERs read their own rows. Restaurant OWNERs read
-- their own assignment row (so we can show "your delivery partner is being
-- finalized"-style status, never the actual fleet name in V1 — UI policy).
--
-- We deliberately do NOT expose any of these to STAFF or anonymous users.
-- ────────────────────────────────────────────────────────────────────────

alter table public.fleet_zones                   enable row level security;
alter table public.fleet_restaurant_assignments  enable row level security;
alter table public.fleet_demand_estimates        enable row level security;
alter table public.fleet_strikes                 enable row level security;

-- ── fleet_zones ────────────────────────────────────────────────────────
drop policy if exists fleet_zones_owner_read on public.fleet_zones;
create policy fleet_zones_owner_read on public.fleet_zones
  for select to authenticated
  using (
    fleet_id in (select id from public.courier_fleets where owner_user_id = auth.uid())
  );

drop policy if exists fleet_zones_owner_write on public.fleet_zones;
create policy fleet_zones_owner_write on public.fleet_zones
  for all to authenticated
  using (
    fleet_id in (select id from public.courier_fleets where owner_user_id = auth.uid())
  )
  with check (
    fleet_id in (select id from public.courier_fleets where owner_user_id = auth.uid())
  );

-- ── fleet_restaurant_assignments ───────────────────────────────────────
-- Restaurant OWNER: read row where their tenant is the restaurant_tenant_id.
drop policy if exists fra_restaurant_owner_read on public.fleet_restaurant_assignments;
create policy fra_restaurant_owner_read on public.fleet_restaurant_assignments
  for select to authenticated
  using (
    restaurant_tenant_id in (
      select tenant_id from public.tenant_members
       where user_id = auth.uid() and role = 'OWNER'
    )
  );

-- Fleet OWNER: read row where their fleet is the fleet_id.
drop policy if exists fra_fleet_owner_read on public.fleet_restaurant_assignments;
create policy fra_fleet_owner_read on public.fleet_restaurant_assignments
  for select to authenticated
  using (
    fleet_id in (select id from public.courier_fleets where owner_user_id = auth.uid())
  );

-- Writes: service_role only (platform-admin actions go through the admin
-- client). No authenticated INSERT/UPDATE/DELETE policy = denied by default.

-- ── fleet_demand_estimates ─────────────────────────────────────────────
-- Tenant OWNER: read + write own self_estimate rows (so the onboarding
-- wizard can capture forecasts).
drop policy if exists fde_tenant_owner_self on public.fleet_demand_estimates;
create policy fde_tenant_owner_self on public.fleet_demand_estimates
  for all to authenticated
  using (
    source = 'self_estimate'
    and tenant_id in (
      select tenant_id from public.tenant_members
       where user_id = auth.uid() and role = 'OWNER'
    )
  )
  with check (
    source = 'self_estimate'
    and tenant_id in (
      select tenant_id from public.tenant_members
       where user_id = auth.uid() and role = 'OWNER'
    )
  );

-- Manual + auto rows: service_role only (platform admin). No authenticated
-- read either — keeps the city-level aggregate internal to allocation.

-- ── fleet_strikes ──────────────────────────────────────────────────────
-- Fleet OWNER: read strikes against their fleet (transparency on pairing
-- health). Insert via service_role only — strikes are logged by the
-- platform-admin "Mark strike" action so we have an audit trail.
drop policy if exists fleet_strikes_fleet_owner_read on public.fleet_strikes;
create policy fleet_strikes_fleet_owner_read on public.fleet_strikes
  for select to authenticated
  using (
    fleet_id in (select id from public.courier_fleets where owner_user_id = auth.uid())
  );

-- Restaurant OWNER: read strikes against their tenant (so they see why a
-- fallback kicked in).
drop policy if exists fleet_strikes_restaurant_owner_read on public.fleet_strikes;
create policy fleet_strikes_restaurant_owner_read on public.fleet_strikes
  for select to authenticated
  using (
    restaurant_tenant_id in (
      select tenant_id from public.tenant_members
       where user_id = auth.uid() and role = 'OWNER'
    )
  );

-- ────────────────────────────────────────────────────────────────────────
-- 7. updated_at maintenance trigger (mirrors pattern in 20260606_004
--    reservation_table_plan)
-- ────────────────────────────────────────────────────────────────────────
create or replace function public.fleet_alloc_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists fleet_zones_set_updated_at on public.fleet_zones;
create trigger fleet_zones_set_updated_at
  before update on public.fleet_zones
  for each row execute function public.fleet_alloc_set_updated_at();

drop trigger if exists fra_set_updated_at on public.fleet_restaurant_assignments;
create trigger fra_set_updated_at
  before update on public.fleet_restaurant_assignments
  for each row execute function public.fleet_alloc_set_updated_at();

drop trigger if exists fde_set_updated_at on public.fleet_demand_estimates;
create trigger fde_set_updated_at
  before update on public.fleet_demand_estimates
  for each row execute function public.fleet_alloc_set_updated_at();
