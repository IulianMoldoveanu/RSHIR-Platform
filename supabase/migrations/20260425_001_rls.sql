-- HIR Restaurant Suite - Row Level Security policies
-- Pattern: tenant_member checks via auth.uid() membership in tenant_members.
-- Anonymous (anon role) gets read-only access where the storefront needs it.
-- Idempotent (drops existing policies before recreating).

-- ============================================================
-- Helper: is auth.uid() a member of <tenant_id>?
-- ============================================================
create or replace function public.is_tenant_member(t_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_members
    where tenant_id = t_id
      and user_id = auth.uid()
  );
$$;

-- ============================================================
-- Enable RLS on every table
-- ============================================================
alter table public.tenants                       enable row level security;
alter table public.tenant_members                enable row level security;
alter table public.restaurant_menu_categories    enable row level security;
alter table public.restaurant_menu_items         enable row level security;
alter table public.restaurant_menu_modifiers     enable row level security;
alter table public.customers                     enable row level security;
alter table public.customer_addresses            enable row level security;
alter table public.delivery_zones                enable row level security;
alter table public.delivery_pricing_tiers        enable row level security;
alter table public.restaurant_orders             enable row level security;
alter table public.menu_events                   enable row level security;

-- ============================================================
-- TENANTS
-- Anonymous can SELECT (storefront resolves tenant by slug/host).
-- Members can SELECT their own tenants. Only members can UPDATE.
-- INSERT goes through service-role admin flow (no public policy).
-- ============================================================
drop policy if exists "tenants_anon_select" on public.tenants;
create policy "tenants_anon_select"
  on public.tenants for select
  to anon
  using (true);

drop policy if exists "tenants_member_select" on public.tenants;
create policy "tenants_member_select"
  on public.tenants for select
  to authenticated
  using (public.is_tenant_member(id));

drop policy if exists "tenants_member_update" on public.tenants;
create policy "tenants_member_update"
  on public.tenants for update
  to authenticated
  using (public.is_tenant_member(id))
  with check (public.is_tenant_member(id));

-- ============================================================
-- TENANT_MEMBERS
-- A user can see their own membership rows.
-- ============================================================
drop policy if exists "members_self_select" on public.tenant_members;
create policy "members_self_select"
  on public.tenant_members for select
  to authenticated
  using (user_id = auth.uid() or public.is_tenant_member(tenant_id));

-- ============================================================
-- MENU CATEGORIES
-- Anon: only active. Members: full CRUD on their tenant.
-- ============================================================
drop policy if exists "menu_categories_anon_select" on public.restaurant_menu_categories;
create policy "menu_categories_anon_select"
  on public.restaurant_menu_categories for select
  to anon
  using (is_active = true);

drop policy if exists "menu_categories_member_select" on public.restaurant_menu_categories;
create policy "menu_categories_member_select"
  on public.restaurant_menu_categories for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists "menu_categories_member_insert" on public.restaurant_menu_categories;
create policy "menu_categories_member_insert"
  on public.restaurant_menu_categories for insert
  to authenticated
  with check (public.is_tenant_member(tenant_id));

drop policy if exists "menu_categories_member_update" on public.restaurant_menu_categories;
create policy "menu_categories_member_update"
  on public.restaurant_menu_categories for update
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

drop policy if exists "menu_categories_member_delete" on public.restaurant_menu_categories;
create policy "menu_categories_member_delete"
  on public.restaurant_menu_categories for delete
  to authenticated
  using (public.is_tenant_member(tenant_id));

-- ============================================================
-- MENU ITEMS
-- Anon: only available. Members: full CRUD.
-- ============================================================
drop policy if exists "menu_items_anon_select" on public.restaurant_menu_items;
create policy "menu_items_anon_select"
  on public.restaurant_menu_items for select
  to anon
  using (is_available = true);

drop policy if exists "menu_items_member_select" on public.restaurant_menu_items;
create policy "menu_items_member_select"
  on public.restaurant_menu_items for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists "menu_items_member_insert" on public.restaurant_menu_items;
create policy "menu_items_member_insert"
  on public.restaurant_menu_items for insert
  to authenticated
  with check (public.is_tenant_member(tenant_id));

drop policy if exists "menu_items_member_update" on public.restaurant_menu_items;
create policy "menu_items_member_update"
  on public.restaurant_menu_items for update
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

drop policy if exists "menu_items_member_delete" on public.restaurant_menu_items;
create policy "menu_items_member_delete"
  on public.restaurant_menu_items for delete
  to authenticated
  using (public.is_tenant_member(tenant_id));

-- ============================================================
-- MENU MODIFIERS (read-anon via item visibility, member CRUD via item tenant)
-- ============================================================
drop policy if exists "menu_modifiers_anon_select" on public.restaurant_menu_modifiers;
create policy "menu_modifiers_anon_select"
  on public.restaurant_menu_modifiers for select
  to anon
  using (
    exists (
      select 1 from public.restaurant_menu_items i
      where i.id = restaurant_menu_modifiers.item_id and i.is_available = true
    )
  );

drop policy if exists "menu_modifiers_member_all" on public.restaurant_menu_modifiers;
create policy "menu_modifiers_member_all"
  on public.restaurant_menu_modifiers for all
  to authenticated
  using (
    exists (
      select 1 from public.restaurant_menu_items i
      where i.id = restaurant_menu_modifiers.item_id
        and public.is_tenant_member(i.tenant_id)
    )
  )
  with check (
    exists (
      select 1 from public.restaurant_menu_items i
      where i.id = restaurant_menu_modifiers.item_id
        and public.is_tenant_member(i.tenant_id)
    )
  );

-- ============================================================
-- CUSTOMERS (members only)
-- ============================================================
drop policy if exists "customers_member_all" on public.customers;
create policy "customers_member_all"
  on public.customers for all
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- ============================================================
-- CUSTOMER ADDRESSES (members only, via customer.tenant_id)
-- ============================================================
drop policy if exists "customer_addresses_member_all" on public.customer_addresses;
create policy "customer_addresses_member_all"
  on public.customer_addresses for all
  to authenticated
  using (
    exists (
      select 1 from public.customers c
      where c.id = customer_addresses.customer_id
        and public.is_tenant_member(c.tenant_id)
    )
  )
  with check (
    exists (
      select 1 from public.customers c
      where c.id = customer_addresses.customer_id
        and public.is_tenant_member(c.tenant_id)
    )
  );

-- ============================================================
-- DELIVERY ZONES (anon read, members CRUD)
-- ============================================================
drop policy if exists "delivery_zones_anon_select" on public.delivery_zones;
create policy "delivery_zones_anon_select"
  on public.delivery_zones for select
  to anon
  using (is_active = true);

drop policy if exists "delivery_zones_member_all" on public.delivery_zones;
create policy "delivery_zones_member_all"
  on public.delivery_zones for all
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- ============================================================
-- DELIVERY PRICING TIERS (anon read, members CRUD)
-- ============================================================
drop policy if exists "delivery_tiers_anon_select" on public.delivery_pricing_tiers;
create policy "delivery_tiers_anon_select"
  on public.delivery_pricing_tiers for select
  to anon
  using (true);

drop policy if exists "delivery_tiers_member_all" on public.delivery_pricing_tiers;
create policy "delivery_tiers_member_all"
  on public.delivery_pricing_tiers for all
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- ============================================================
-- ORDERS
-- Members can see/manage all orders for their tenant.
-- Inserts/public-track-token paths go through service-role server actions
-- (no anon policy here on purpose - external order creation must use the service key
--  via a server route or edge function).
-- ============================================================
drop policy if exists "orders_member_select" on public.restaurant_orders;
create policy "orders_member_select"
  on public.restaurant_orders for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists "orders_member_update" on public.restaurant_orders;
create policy "orders_member_update"
  on public.restaurant_orders for update
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

drop policy if exists "orders_member_insert" on public.restaurant_orders;
create policy "orders_member_insert"
  on public.restaurant_orders for insert
  to authenticated
  with check (public.is_tenant_member(tenant_id));

-- ============================================================
-- MENU EVENTS (members only, both insert + select)
-- ============================================================
drop policy if exists "menu_events_member_select" on public.menu_events;
create policy "menu_events_member_select"
  on public.menu_events for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists "menu_events_member_insert" on public.menu_events;
create policy "menu_events_member_insert"
  on public.menu_events for insert
  to authenticated
  with check (public.is_tenant_member(tenant_id));
