-- Menu brands — lets ONE tenant (one physical kitchen) present its menu as
-- several distinct customer-facing brands, sharing checkout/cart/pickup
-- address/customer identity as a single tenant. Built for Delivery House:
-- one cloud kitchen, multiple restaurant brands (Chicken Press, Brunch
-- House, Egg & Smash House, ...), one unified cart per order.
--
-- Deliberately NOT named `brands` / `brand_id` — this codebase already has
-- two unrelated "brand" concepts: `tenants.parent_brand_id` (multi-LOCATION
-- brand family — several separate tenants under one brand) and
-- `content_brand_contexts` (marketing/content-OS brand identity). Using
-- `restaurant_menu_brands` / `menu_brand_id` keeps all three distinct.
--
-- Scoping: a category belongs to at most one menu brand (or none, for
-- tenants that don't use this feature — nullable, no behavior change for
-- existing single-brand tenants). Items inherit their brand via category;
-- no separate brand_id needed on restaurant_menu_items.

create table if not exists public.restaurant_menu_brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slug text not null,
  name text not null,
  tagline text,
  logo_url text,
  cover_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_menu_brands_slug_format check (slug ~ '^[a-z0-9-]+$'),
  constraint restaurant_menu_brands_tenant_slug_unique unique (tenant_id, slug)
);

create index if not exists idx_menu_brands_tenant on public.restaurant_menu_brands(tenant_id);
create index if not exists idx_menu_brands_tenant_active
  on public.restaurant_menu_brands(tenant_id, is_active);

alter table public.restaurant_menu_categories
  add column if not exists menu_brand_id uuid references public.restaurant_menu_brands(id) on delete set null;

create index if not exists idx_menu_categories_menu_brand
  on public.restaurant_menu_categories(menu_brand_id)
  where menu_brand_id is not null;

-- RLS mirrors restaurant_menu_categories / restaurant_menu_items exactly —
-- same is_tenant_member() scoping, anon read gated on is_active.
alter table public.restaurant_menu_brands enable row level security;

create policy "menu_brands_anon_select"
  on public.restaurant_menu_brands for select
  to anon
  using (is_active = true);

create policy "menu_brands_member_select"
  on public.restaurant_menu_brands for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy "menu_brands_member_insert"
  on public.restaurant_menu_brands for insert
  to authenticated
  with check (public.is_tenant_member(tenant_id));

create policy "menu_brands_member_update"
  on public.restaurant_menu_brands for update
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

create policy "menu_brands_member_delete"
  on public.restaurant_menu_brands for delete
  to authenticated
  using (public.is_tenant_member(tenant_id));

create trigger touch_restaurant_menu_brands_updated_at
  before update on public.restaurant_menu_brands
  for each row execute function public.touch_updated_at();
