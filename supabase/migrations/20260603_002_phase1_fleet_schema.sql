-- Phase 1 fleet schema bundle (courier roadmap 2026-05-04).
-- Unblocks Mode B (multi-vendor riders) and Mode C (fleet-managed riders) in
-- the courier app, plus admin-side courier-assignment UI in a follow-up.
--
-- All changes are additive + idempotent. Default values are null/false so
-- existing rows + application code keep working unchanged. Hard cutover to
-- the new dispatch flow happens in Phase 2 behind a feature flag.

-- 1. Allow tenant members to be tagged as FLEET_MANAGER. The check is
--    drop-and-recreate because Postgres has no "alter check" — no rows
--    can match the new constraint that didn't match the old one, so this
--    is safe under concurrent writes (the new constraint is strictly
--    wider).
alter table public.tenant_members
  drop constraint if exists tenant_members_role_check;

alter table public.tenant_members
  add constraint tenant_members_role_check
  check (role = any (array['OWNER'::text, 'STAFF'::text, 'FLEET_MANAGER'::text]));

-- 2. Link a restaurant order to the courier delivering it. Nullable; the
--    courier app populates it via assignCourier() in Phase 2. Indexed for
--    "what's everyone delivering right now" queries on the FM dashboard.
alter table public.restaurant_orders
  add column if not exists courier_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_restaurant_orders_courier_user_id
  on public.restaurant_orders(courier_user_id)
  where courier_user_id is not null;

-- 3. Link the unified courier_orders feed back to the source restaurant
--    order so couriers can pull restaurant-side metadata (driver notes,
--    table number, repeat-customer flag) without joining through
--    source_order_id text matching.
alter table public.courier_orders
  add column if not exists restaurant_order_id uuid references public.restaurant_orders(id) on delete set null;

create index if not exists idx_courier_orders_restaurant_order_id
  on public.courier_orders(restaurant_order_id)
  where restaurant_order_id is not null;

-- 4. Per-member capability flag for fleet management (parallel to
--    can_manage_zones from migration 20260603_001). OWNERs and
--    FLEET_MANAGERs bypass this flag in application code; STAFF need
--    explicit grant to assign couriers.
alter table public.tenant_members
  add column if not exists can_manage_fleet boolean not null default false;

comment on column public.tenant_members.can_manage_fleet is
  'When true, this STAFF member can assign couriers to orders and edit fleet roster. OWNERs and FLEET_MANAGERs bypass this flag in application code. Toggle from /dashboard/settings/team.';
