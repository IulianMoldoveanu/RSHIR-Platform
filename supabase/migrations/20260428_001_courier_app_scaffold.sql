-- HIR Courier App — initial schema
-- Standalone PWA for couriers: receives orders from HIR tenants (via SDK)
-- AND from third-party clients (via per-key Bearer auth).
-- Idempotent (uses IF NOT EXISTS / drop-if-exists for policies).

create extension if not exists "pgcrypto";

-- ============================================================
-- COURIER PROFILES
-- One row per courier. Keyed by auth.users(id).
-- ============================================================
create table if not exists public.courier_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  vehicle_type text not null check (vehicle_type in ('BIKE','SCOOTER','CAR')),
  status text not null default 'INACTIVE' check (status in ('INACTIVE','ACTIVE','SUSPENDED')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- COURIER SHIFTS
-- One row per shift session. status='ONLINE' means currently in a shift.
-- A unique partial index keeps at most one ONLINE shift per courier.
-- ============================================================
create table if not exists public.courier_shifts (
  id uuid primary key default gen_random_uuid(),
  courier_user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'ONLINE' check (status in ('ONLINE','OFFLINE')),
  last_lat numeric(10, 7),
  last_lng numeric(10, 7),
  last_seen_at timestamptz
);
create index if not exists idx_courier_shifts_user on public.courier_shifts(courier_user_id);
create unique index if not exists uq_courier_shifts_one_online
  on public.courier_shifts(courier_user_id)
  where status = 'ONLINE';

-- ============================================================
-- COURIER ORDERS
-- Source can be:
--   * HIR_TENANT  — posted by an HIR restaurant tenant via the SDK
--   * EXTERNAL_API — posted by a third-party using a courier_api_keys token
--   * MANUAL — created by the courier themselves (web form)
-- ============================================================
create table if not exists public.courier_orders (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('HIR_TENANT','EXTERNAL_API','MANUAL')),
  source_tenant_id uuid references public.tenants(id) on delete set null,
  source_order_id text,
  customer_first_name text,
  customer_phone text,
  pickup_line1 text,
  pickup_lat numeric(10, 7),
  pickup_lng numeric(10, 7),
  dropoff_line1 text,
  dropoff_lat numeric(10, 7),
  dropoff_lng numeric(10, 7),
  items jsonb not null default '[]'::jsonb,
  total_ron numeric(10, 2),
  delivery_fee_ron numeric(10, 2),
  payment_method text check (payment_method in ('CARD','COD')),
  status text not null default 'CREATED'
    check (status in ('CREATED','OFFERED','ACCEPTED','PICKED_UP','IN_TRANSIT','DELIVERED','CANCELLED')),
  assigned_courier_user_id uuid references auth.users(id) on delete set null,
  public_track_token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_courier_orders_status_created
  on public.courier_orders(status, created_at desc);
create index if not exists idx_courier_orders_assigned
  on public.courier_orders(assigned_courier_user_id, status);
create index if not exists idx_courier_orders_source
  on public.courier_orders(source_tenant_id, source_order_id);

-- ============================================================
-- COURIER API KEYS
-- One row per integration credential. `key_hash` is sha256(raw token).
-- `hir_tenant_id` is set when the key belongs to an HIR restaurant tenant
-- (so orders are tagged HIR_TENANT instead of EXTERNAL_API).
-- ============================================================
create table if not exists public.courier_api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  hir_tenant_id uuid references public.tenants(id) on delete set null,
  label text not null,
  scopes text[] not null default '{orders:write,orders:read,orders:cancel}',
  key_hash text not null unique,
  last_used_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_courier_api_keys_owner on public.courier_api_keys(owner_user_id);

-- ============================================================
-- RLS
-- Service-role bypasses RLS automatically; the policies below cover
-- the authenticated couriers using the PWA.
-- ============================================================
alter table public.courier_profiles enable row level security;
alter table public.courier_shifts enable row level security;
alter table public.courier_orders enable row level security;
alter table public.courier_api_keys enable row level security;

-- courier_profiles: a courier can read & update their own row.
drop policy if exists "courier_profiles_self_select" on public.courier_profiles;
create policy "courier_profiles_self_select"
  on public.courier_profiles for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "courier_profiles_self_update" on public.courier_profiles;
create policy "courier_profiles_self_update"
  on public.courier_profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- courier_shifts: courier sees & inserts only their own shifts.
drop policy if exists "courier_shifts_self_select" on public.courier_shifts;
create policy "courier_shifts_self_select"
  on public.courier_shifts for select
  to authenticated
  using (courier_user_id = auth.uid());

drop policy if exists "courier_shifts_self_insert" on public.courier_shifts;
create policy "courier_shifts_self_insert"
  on public.courier_shifts for insert
  to authenticated
  with check (courier_user_id = auth.uid());

drop policy if exists "courier_shifts_self_update" on public.courier_shifts;
create policy "courier_shifts_self_update"
  on public.courier_shifts for update
  to authenticated
  using (courier_user_id = auth.uid())
  with check (courier_user_id = auth.uid());

-- courier_orders: courier reads orders assigned to them OR currently OFFERED
-- and unassigned. Inserts/cancels go through service-role routes.
drop policy if exists "courier_orders_assignee_or_offered_select" on public.courier_orders;
create policy "courier_orders_assignee_or_offered_select"
  on public.courier_orders for select
  to authenticated
  using (
    assigned_courier_user_id = auth.uid()
    or (assigned_courier_user_id is null and status in ('CREATED','OFFERED'))
  );

-- courier_api_keys: owner sees & manages only their own keys.
drop policy if exists "courier_api_keys_owner_select" on public.courier_api_keys;
create policy "courier_api_keys_owner_select"
  on public.courier_api_keys for select
  to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "courier_api_keys_owner_insert" on public.courier_api_keys;
create policy "courier_api_keys_owner_insert"
  on public.courier_api_keys for insert
  to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists "courier_api_keys_owner_update" on public.courier_api_keys;
create policy "courier_api_keys_owner_update"
  on public.courier_api_keys for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
