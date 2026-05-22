-- Repair migration for the 2026-05-22 courier-ops trio (PR #715, #717).
--
-- Background
-- ──────────
-- 20260522_001_courier_zone_pricing.sql tried to create `public.delivery_zones`
-- as a city-owned pricing-ring table (with city_id FK). That clashes with the
-- pre-existing `public.delivery_zones` table from 20260425_000_initial.sql
-- which is a per-tenant polygon table used by 28+ callsites (dispatch, AI
-- orchestrator, onboarding, etc.). The `create table if not exists` short-
-- circuited but every subsequent statement referenced `city_id` on the legacy
-- shape and failed.
--
-- 20260522_003_ops_settings.sql tried to ALTER tenants.dispatch_mode to a
-- new enum type but the view `v_tenants_storefront` (20260509_003) depends on
-- that column, so the type change errored with 0A000.
--
-- Decision (Iulian 2026-05-22, confirmed)
-- ───────────────────────────────────────
-- - Rename the *new* city-pricing concept to `pricing_zones`. Keep the legacy
--   `delivery_zones` table untouched.
-- - For the enum migration: drop+recreate `v_tenants_storefront` around the
--   ALTER, so the column type swap can land.
--
-- All statements are additive and idempotent.

-- ============================================================
-- A. pricing_zones (was: 20260522_001 → public.delivery_zones)
-- ============================================================

create table if not exists public.pricing_zones (
  id                   uuid        primary key default gen_random_uuid(),
  city_id              uuid        not null references public.cities(id) on delete restrict,
  name                 text        not null,
  zone_type            text        not null check (zone_type in ('URBAN', 'EXTRA_URBAN')),
  geometry             jsonb,
  max_distance_km      numeric(6,2),
  restaurant_fee_cents int         not null,
  courier_payout_cents int         not null,
  localities           text[]      not null default array[]::text[],
  active               boolean     not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint pricing_zones_margin_nonnegative
    check (restaurant_fee_cents >= courier_payout_cents)
);

create index if not exists idx_pricing_zones_city_active
  on public.pricing_zones (city_id, active);

comment on table public.pricing_zones is
  'City-owned flat-fee pricing rings. Renamed from the original delivery_zones target in 20260522_001 to avoid colliding with the legacy per-tenant delivery_zones table from 20260425_000.';

-- ============================================================
-- B. tenant_pricing_overrides
-- ============================================================

create table if not exists public.tenant_pricing_overrides (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references public.tenants(id) on delete cascade,
  zone_id              uuid        not null references public.pricing_zones(id) on delete restrict,
  restaurant_fee_cents int         not null,
  courier_payout_cents int         not null,
  valid_from           timestamptz not null default now(),
  valid_until          timestamptz,
  reason               text        not null,
  created_by           uuid        not null references auth.users(id) on delete restrict,
  created_at           timestamptz not null default now(),

  constraint tenant_pricing_overrides_margin_nonnegative
    check (restaurant_fee_cents >= courier_payout_cents)
);

create index if not exists idx_tenant_pricing_overrides_tenant_zone
  on public.tenant_pricing_overrides (tenant_id, zone_id, valid_from desc);

-- ============================================================
-- C. delivery_pricings
-- ============================================================

create table if not exists public.delivery_pricings (
  id                   uuid        primary key default gen_random_uuid(),
  delivery_id          uuid        not null references public.courier_orders(id) on delete restrict,
  zone_id              uuid        not null references public.pricing_zones(id) on delete restrict,
  restaurant_fee_cents int         not null,
  courier_payout_cents int         not null,
  hir_margin_cents     int         generated always as (restaurant_fee_cents - courier_payout_cents) stored,
  formula_snapshot     jsonb       not null,
  computed_at          timestamptz not null default now(),
  repriced_from_id     uuid        references public.delivery_pricings(id) on delete set null,

  constraint delivery_pricings_margin_nonnegative
    check (restaurant_fee_cents >= courier_payout_cents)
);

create index if not exists idx_delivery_pricings_delivery_id
  on public.delivery_pricings (delivery_id, computed_at desc);

create index if not exists idx_delivery_pricings_zone_id
  on public.delivery_pricings (zone_id);

-- ============================================================
-- D. payout_periods + payout_items
-- ============================================================

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
  paid_method      text        check (paid_method in ('BANK_TRANSFER', 'CASH', 'OTHER')),
  payment_ref      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint payout_periods_dates_valid
    check (period_end > period_start),
  constraint payout_periods_unique_window
    unique (courier_user_id, period_start, period_end)
);

create index if not exists idx_payout_periods_courier_status
  on public.payout_periods (courier_user_id, status);
create index if not exists idx_payout_periods_city_status
  on public.payout_periods (city_id, status);

create table if not exists public.payout_items (
  id                   uuid  primary key default gen_random_uuid(),
  payout_period_id     uuid  not null references public.payout_periods(id) on delete cascade,
  delivery_pricing_id  uuid  not null references public.delivery_pricings(id) on delete restrict,
  amount_cents         int   not null,
  formula_snapshot     jsonb not null,

  constraint payout_items_unique_pricing
    unique (delivery_pricing_id)
);

create index if not exists idx_payout_items_period
  on public.payout_items (payout_period_id);

-- ============================================================
-- E. RLS
-- ============================================================

alter table public.pricing_zones            enable row level security;
alter table public.tenant_pricing_overrides enable row level security;
alter table public.delivery_pricings        enable row level security;
alter table public.payout_periods           enable row level security;
alter table public.payout_items             enable row level security;

drop policy if exists "pricing_zones_authenticated_select" on public.pricing_zones;
create policy "pricing_zones_authenticated_select"
  on public.pricing_zones for select
  to anon, authenticated
  using (true);

drop policy if exists "pricing_zones_service_role_all" on public.pricing_zones;
create policy "pricing_zones_service_role_all"
  on public.pricing_zones for all
  to service_role
  using (true)
  with check (true);

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

drop policy if exists "delivery_pricings_tenant_or_courier_select" on public.delivery_pricings;
create policy "delivery_pricings_tenant_or_courier_select"
  on public.delivery_pricings for select
  to authenticated
  using (
    delivery_id in (
      select id from public.courier_orders
       where source_tenant_id in (
         select tenant_id from public.tenant_members where user_id = auth.uid()
       )
    )
    or
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

-- ============================================================
-- F. Brașov seed — 4 pricing rings
-- ============================================================

do $$
declare
  v_brasov_id uuid;
begin
  select id into v_brasov_id from public.cities where slug = 'brasov';

  if v_brasov_id is null then
    raise notice 'Brașov city row not found — skipping zone seed.';
    return;
  end if;

  insert into public.pricing_zones
    (city_id, name, zone_type, geometry, max_distance_km,
     restaurant_fee_cents, courier_payout_cents, localities, active)
  select v_brasov_id,
         'Brașov - Zona 1 (urban, 0-6 km)',
         'URBAN',
         '{"type":"Circle","center":[25.6112,45.6536],"radius_m":6000}'::jsonb,
         6,
         2000, 1500,
         array['Brașov']::text[],
         true
  where not exists (
    select 1 from public.pricing_zones
     where city_id = v_brasov_id
       and name = 'Brașov - Zona 1 (urban, 0-6 km)'
  );

  insert into public.pricing_zones
    (city_id, name, zone_type, geometry, max_distance_km,
     restaurant_fee_cents, courier_payout_cents, localities, active)
  select v_brasov_id,
         'Brașov - Zona 2 (6-10 km)',
         'EXTRA_URBAN',
         '{"type":"Ring","center":[25.6112,45.6536],"radius_m_min":6000,"radius_m_max":10000}'::jsonb,
         10,
         3000, 2400,
         array['Sânpetru', 'Ghimbav', 'Stupini']::text[],
         true
  where not exists (
    select 1 from public.pricing_zones
     where city_id = v_brasov_id
       and name = 'Brașov - Zona 2 (6-10 km)'
  );

  insert into public.pricing_zones
    (city_id, name, zone_type, geometry, max_distance_km,
     restaurant_fee_cents, courier_payout_cents, localities, active)
  select v_brasov_id,
         'Brașov - Zona 3 (10-14 km)',
         'EXTRA_URBAN',
         '{"type":"Ring","center":[25.6112,45.6536],"radius_m_min":10000,"radius_m_max":14000}'::jsonb,
         14,
         3500, 2800,
         array['Hărman', 'Săcele', 'Timișu de Jos', 'Cristian', 'Tărlungeni']::text[],
         true
  where not exists (
    select 1 from public.pricing_zones
     where city_id = v_brasov_id
       and name = 'Brașov - Zona 3 (10-14 km)'
  );

  insert into public.pricing_zones
    (city_id, name, zone_type, geometry, max_distance_km,
     restaurant_fee_cents, courier_payout_cents, localities, active)
  select v_brasov_id,
         'Brașov - Zona 4 (14+ km)',
         'EXTRA_URBAN',
         '{"type":"Ring","center":[25.6112,45.6536],"radius_m_min":14000,"radius_m_max":30000}'::jsonb,
         30,
         5000, 4000,
         array['Codlea', 'Bod', 'Hălchiu', 'Poiana Brașov', 'Râșnov']::text[],
         true
  where not exists (
    select 1 from public.pricing_zones
     where city_id = v_brasov_id
       and name = 'Brașov - Zona 4 (14+ km)'
  );
end $$;

-- ============================================================
-- G. dispatch_mode → enum  (re-do of 20260522_003 with view dance)
-- ============================================================

-- The new enum.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'dispatch_mode_enum') then
    create type public.dispatch_mode_enum as enum ('MANUAL_PUSH', 'SELF_PICKUP', 'HYBRID');
  end if;
end $$;

-- Idempotent guard: only run the ALTER block if the column is still text.
do $$
declare
  v_col_type text;
  v_constraint text;
begin
  select format_type(atttypid, atttypmod)
    into v_col_type
   from pg_attribute
   where attrelid = 'public.tenants'::regclass
     and attname = 'dispatch_mode'
     and not attisdropped;

  if v_col_type is null then
    raise notice 'tenants.dispatch_mode column missing — skipping enum migration.';
    return;
  end if;

  if v_col_type = 'dispatch_mode_enum' then
    -- Already migrated.
    return;
  end if;

  -- Drop the dependent view so we can swap the column type.
  execute 'drop view if exists public.v_tenants_storefront';

  -- Drop any old check constraint by definition.
  select conname into v_constraint
    from pg_constraint
   where conrelid = 'public.tenants'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%dispatch_mode%';

  if v_constraint is not null then
    execute format('alter table public.tenants drop constraint %I', v_constraint);
  end if;

  execute $sql$
    alter table public.tenants
      alter column dispatch_mode drop default,
      alter column dispatch_mode type public.dispatch_mode_enum
        using case dispatch_mode
                when 'MANUAL' then 'MANUAL_PUSH'::public.dispatch_mode_enum
                when 'AUTO'   then 'HYBRID'::public.dispatch_mode_enum
                else               'HYBRID'::public.dispatch_mode_enum
              end,
      alter column dispatch_mode set default 'HYBRID'::public.dispatch_mode_enum
  $sql$;
end $$;

-- Recreate the storefront view (verbatim from 20260509_003).
create or replace view public.v_tenants_storefront
with (security_invoker = off)
as
  select
    id,
    slug,
    name,
    vertical,
    custom_domain,
    status,
    dispatch_mode,
    domain_status,
    domain_verified_at,
    integration_mode,
    template_slug,
    city_id,
    feature_flags,
    created_at,
    updated_at,
    coalesce(settings, '{}'::jsonb)
      - 'cod_caen'
      - 'cui'
      - 'reg_com'
      - 'legal_company'
      - 'legal_address'
      - 'legal_postal_code'
      - 'email_notifications_enabled'
      - 'onboarding'
      - 'pause_reason'
      as settings
  from public.tenants
  where status = 'ACTIVE'
     or (custom_domain is not null and domain_status = 'ACTIVE');

grant select on public.v_tenants_storefront to anon, authenticated;

-- ============================================================
-- H. courier_profiles.max_parallel_orders  (re-do of 20260522_003 part 1)
-- ============================================================

alter table public.courier_profiles
  add column if not exists max_parallel_orders int
    check (max_parallel_orders is null or max_parallel_orders between 1 and 10);

comment on column public.courier_profiles.max_parallel_orders is
  'Max comenzi paralele asignate simultan curierului. NULL = unlimited. Configurat din Control Room.';

-- ============================================================
-- I. tenant_display_pins + RPCs  (re-do of 20260522_003 parts 3-6)
-- ============================================================

create table if not exists public.tenant_display_pins (
  tenant_id    uuid primary key references public.tenants(id) on delete cascade,
  pin_hash     text not null,
  label        text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.tenant_display_pins enable row level security;

create or replace function public.verify_display_pin(p_tenant_slug text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_pin_hash  text;
  v_tenant_id uuid;
begin
  select t.id, tdp.pin_hash
    into v_tenant_id, v_pin_hash
   from public.tenants t
   join public.tenant_display_pins tdp on tdp.tenant_id = t.id
  where t.slug = p_tenant_slug
    and tdp.active = true;

  if v_pin_hash is null then
    return false;
  end if;

  if v_pin_hash = crypt(p_pin, v_pin_hash) then
    update public.tenant_display_pins
       set last_used_at = now()
     where tenant_id = v_tenant_id;
    return true;
  end if;

  return false;
end;
$fn$;

grant execute on function public.verify_display_pin(text, text) to anon, authenticated;

create or replace function public.set_display_pin(p_tenant_id uuid, p_new_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.tenant_display_pins (tenant_id, pin_hash, active)
  values (p_tenant_id, crypt(p_new_pin, gen_salt('bf')), true)
  on conflict (tenant_id) do update
    set pin_hash    = excluded.pin_hash,
        active      = true,
        updated_at  = now();
end;
$fn$;

revoke execute on function public.set_display_pin(uuid, text) from anon, authenticated;

-- Demo PIN for deliveryhouse tenant (1234).
do $$
declare
  v_tenant_id uuid;
begin
  select id into v_tenant_id from public.tenants where slug = 'deliveryhouse';
  if v_tenant_id is null then
    raise notice 'Tenant "deliveryhouse" not found — skipping demo PIN.';
    return;
  end if;
  insert into public.tenant_display_pins (tenant_id, pin_hash, label)
  values (v_tenant_id, crypt('1234', gen_salt('bf')), 'Tabletă demo deliveryhouse')
  on conflict (tenant_id) do nothing;
end $$;
