-- HIR Restaurant Suite - initial schema
-- Project: qfmeojeipncuxeltnvab (eu-central-1 Frankfurt)
-- Idempotent (uses IF NOT EXISTS) so re-applying is safe.

create extension if not exists "pgcrypto";

-- ============================================================
-- TENANTS
-- ============================================================
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  vertical text not null default 'RESTAURANT',
  custom_domain text unique,
  status text not null default 'ONBOARDING' check (status in ('ONBOARDING','ACTIVE','SUSPENDED')),
  dispatch_mode text not null default 'MANUAL' check (dispatch_mode in ('MANUAL','AUTO')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- TENANT MEMBERS (links auth.users to tenants with a role)
-- ============================================================
create table if not exists public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER','STAFF')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index if not exists idx_tenant_members_user_id on public.tenant_members(user_id);
create index if not exists idx_tenant_members_tenant_id on public.tenant_members(tenant_id);

-- ============================================================
-- MENU
-- ============================================================
create table if not exists public.restaurant_menu_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_menu_categories_tenant on public.restaurant_menu_categories(tenant_id);

create table if not exists public.restaurant_menu_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category_id uuid not null references public.restaurant_menu_categories(id) on delete cascade,
  name text not null,
  description text,
  price_ron numeric(10,2) not null,
  image_url text,
  is_available boolean not null default true,
  sort_order int not null default 0,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_menu_items_tenant on public.restaurant_menu_items(tenant_id);
create index if not exists idx_menu_items_tenant_available on public.restaurant_menu_items(tenant_id, is_available);
create index if not exists idx_menu_items_category on public.restaurant_menu_items(category_id);

create table if not exists public.restaurant_menu_modifiers (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.restaurant_menu_items(id) on delete cascade,
  name text not null,
  price_delta_ron numeric(10,2) not null default 0
);
create index if not exists idx_menu_modifiers_item on public.restaurant_menu_modifiers(item_id);

-- ============================================================
-- CUSTOMERS
-- ============================================================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text,
  phone text,
  first_name text,
  last_name text,
  created_at timestamptz not null default now()
);
create index if not exists idx_customers_tenant on public.customers(tenant_id);

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  line1 text not null,
  line2 text,
  city text not null,
  postal_code text,
  country text not null default 'RO',
  latitude double precision,
  longitude double precision,
  label text,
  created_at timestamptz not null default now()
);
create index if not exists idx_customer_addresses_customer on public.customer_addresses(customer_id);

-- ============================================================
-- DELIVERY (zones + tiers)
-- ============================================================
create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  polygon jsonb not null, -- {type:'Polygon', coordinates:[[[lng,lat],...]]}
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_delivery_zones_tenant on public.delivery_zones(tenant_id);

create table if not exists public.delivery_pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  min_km numeric(5,2) not null,
  max_km numeric(5,2) not null,
  price_ron numeric(10,2) not null,
  sort_order int not null default 0
);
create index if not exists idx_delivery_tiers_tenant on public.delivery_pricing_tiers(tenant_id);

-- ============================================================
-- ORDERS
-- ============================================================
create table if not exists public.restaurant_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  delivery_address_id uuid references public.customer_addresses(id) on delete set null,
  items jsonb not null, -- snapshot of line items at order time
  subtotal_ron numeric(10,2) not null,
  delivery_fee_ron numeric(10,2) not null default 0,
  total_ron numeric(10,2) not null,
  status text not null default 'PENDING'
    check (status in ('PENDING','CONFIRMED','PREPARING','READY','DISPATCHED','IN_DELIVERY','DELIVERED','CANCELLED')),
  payment_status text not null default 'UNPAID'
    check (payment_status in ('UNPAID','PAID','REFUNDED','FAILED')),
  stripe_payment_intent_id text,
  hir_delivery_id text,
  public_track_token uuid not null default gen_random_uuid(),
  delivery_zone_id uuid references public.delivery_zones(id) on delete set null,
  delivery_tier_id uuid references public.delivery_pricing_tiers(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_orders_tenant on public.restaurant_orders(tenant_id);
create index if not exists idx_orders_tenant_status_created on public.restaurant_orders(tenant_id, status, created_at desc);
create index if not exists idx_orders_track_token on public.restaurant_orders(public_track_token);

-- ============================================================
-- MENU EVENTS (Realtime broadcast source for availability flips)
-- ============================================================
create table if not exists public.menu_events (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null references public.restaurant_menu_items(id) on delete cascade,
  is_available boolean not null,
  at timestamptz not null default now()
);
create index if not exists idx_menu_events_tenant on public.menu_events(tenant_id, at desc);

-- ============================================================
-- updated_at triggers (auto-bump on row update)
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'tenants',
      'restaurant_menu_categories',
      'restaurant_menu_items',
      'restaurant_orders'
    ])
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%I_updated_at before update on public.%I
       for each row execute function public.touch_updated_at()',
      t, t
    );
  end loop;
end;
$$;
