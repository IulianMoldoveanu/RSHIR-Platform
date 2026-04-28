-- HIR Courier App — multi-fleet + outbound webhook scaffold
--
-- Adds the white-label primitive: a `courier_fleets` row groups couriers,
-- orders, and API keys under one brand. Existing rows are migrated to a
-- "HIR Default" fleet so the app keeps working with zero data shuffle.
--
-- Adds outbound-webhook fields to courier_orders so HIR (or any consumer)
-- can subscribe to status changes via signed POST instead of polling.
--
-- Idempotent.

-- ============================================================
-- 1. courier_fleets — the white-label root
-- ============================================================
create table if not exists public.courier_fleets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  brand_color text not null default '#8b5cf6',
  logo_url text,
  custom_domain text unique,
  owner_user_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_courier_fleets_active on public.courier_fleets(is_active);

-- Seed the default HIR fleet. Idempotent via ON CONFLICT DO NOTHING.
-- All existing-and-future couriers without an explicit fleet land here.
insert into public.courier_fleets (slug, name, brand_color)
values ('hir-default', 'HIR Default Fleet', '#8b5cf6')
on conflict (slug) do nothing;

-- ============================================================
-- 2. fleet_id on profiles / orders / api_keys
-- ============================================================
alter table public.courier_profiles
  add column if not exists fleet_id uuid references public.courier_fleets(id) on delete restrict;

alter table public.courier_orders
  add column if not exists fleet_id uuid references public.courier_fleets(id) on delete restrict;

alter table public.courier_api_keys
  add column if not exists fleet_id uuid references public.courier_fleets(id) on delete restrict;

-- Backfill existing rows to the default fleet (no-op if there are none yet,
-- since the scaffold migration just shipped and prod is empty).
update public.courier_profiles set fleet_id = (select id from public.courier_fleets where slug = 'hir-default')
  where fleet_id is null;
update public.courier_orders set fleet_id = (select id from public.courier_fleets where slug = 'hir-default')
  where fleet_id is null;
update public.courier_api_keys set fleet_id = (select id from public.courier_fleets where slug = 'hir-default')
  where fleet_id is null;

-- Now make fleet_id NOT NULL — guarded with DO block so re-running on a
-- clean fleet_id column doesn't fail.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'courier_profiles'
       and column_name = 'fleet_id' and is_nullable = 'YES'
  ) then
    alter table public.courier_profiles alter column fleet_id set not null;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'courier_orders'
       and column_name = 'fleet_id' and is_nullable = 'YES'
  ) then
    alter table public.courier_orders alter column fleet_id set not null;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'courier_api_keys'
       and column_name = 'fleet_id' and is_nullable = 'YES'
  ) then
    alter table public.courier_api_keys alter column fleet_id set not null;
  end if;
end$$;

create index if not exists idx_courier_orders_fleet on public.courier_orders(fleet_id, status, created_at desc);
create index if not exists idx_courier_profiles_fleet on public.courier_profiles(fleet_id);
create index if not exists idx_courier_api_keys_fleet on public.courier_api_keys(fleet_id);

-- ============================================================
-- 3. Outbound webhook fields on courier_orders
--
-- Third-party consumers (HIR storefront, external restaurants with their
-- own ordering system, aggregators) can subscribe to status changes by
-- providing a callback URL + secret when they POST the order. Whenever
-- the status changes, an Edge Function will POST a signed event to that
-- URL — no polling required.
-- ============================================================
alter table public.courier_orders
  add column if not exists webhook_callback_url text,
  add column if not exists webhook_secret text,
  add column if not exists last_webhook_status text,
  add column if not exists last_webhook_attempt_at timestamptz,
  add column if not exists webhook_failure_count int not null default 0;

-- Index for the dispatcher to find orders whose status diverged from the
-- last successfully-delivered webhook event.
create index if not exists idx_courier_orders_pending_webhook
  on public.courier_orders(status, last_webhook_status, last_webhook_attempt_at)
  where webhook_callback_url is not null and (last_webhook_status is null or last_webhook_status <> status);

-- ============================================================
-- 4. RLS policy refresh — scope reads by fleet
--
-- Couriers see only their own fleet's orders. Service-role bypasses.
-- The scaffold migration's `_member_read` policies are tightened by adding
-- a fleet-equality check.
-- ============================================================

-- courier_orders: a courier sees orders within their fleet (assigned or open)
drop policy if exists courier_orders_self_read on public.courier_orders;
create policy courier_orders_self_read on public.courier_orders
  for select to authenticated
  using (
    fleet_id = (select fleet_id from public.courier_profiles where user_id = auth.uid())
  );

-- courier_profiles: courier sees own profile + co-fleet members (for shift screen)
drop policy if exists courier_profiles_self_read on public.courier_profiles;
create policy courier_profiles_self_read on public.courier_profiles
  for select to authenticated
  using (
    user_id = auth.uid()
    or fleet_id = (select fleet_id from public.courier_profiles where user_id = auth.uid())
  );

-- courier_api_keys: only the fleet owner can list keys
drop policy if exists courier_api_keys_owner_read on public.courier_api_keys;
create policy courier_api_keys_owner_read on public.courier_api_keys
  for select to authenticated
  using (
    fleet_id in (select id from public.courier_fleets where owner_user_id = auth.uid())
  );

-- courier_fleets: anyone authenticated can read fleet branding (safe — only
-- public-display fields), but only owner can update.
alter table public.courier_fleets enable row level security;
drop policy if exists courier_fleets_public_read on public.courier_fleets;
create policy courier_fleets_public_read on public.courier_fleets
  for select to authenticated using (true);
