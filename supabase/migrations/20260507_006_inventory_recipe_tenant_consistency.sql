-- Lane INVENTORY-V1 follow-up (2026-05-07) — composite-FK tenant-consistency
-- on menu_item_recipes. Closes Codex P1 from PR #307.
--
-- Original schema (20260506_013_inventory_v1_schema.sql) used three
-- independent FKs:
--   tenant_id          → tenants(id)
--   menu_item_id       → restaurant_menu_items(id)
--   inventory_item_id  → inventory_items(id)
--
-- This permits a service-role write inserting a recipe whose tenant_id is A
-- but whose menu_item belongs to tenant B and whose inventory_item belongs
-- to tenant C. The PR 3a DELIVERED trigger would then iterate such rows and
-- deplete stock across tenants — a cross-tenant integrity gap.
--
-- Fix: composite FKs `(tenant_id, menu_item_id) → restaurant_menu_items
-- (tenant_id, id)` and `(tenant_id, inventory_item_id) → inventory_items
-- (tenant_id, id)`. Postgres enforces every row's recipe.tenant_id matches
-- the parent rows' tenant_id at INSERT/UPDATE time, with no trigger needed.
--
-- Pre-write probe (Mgmt API, 2026-05-07):
--   SELECT count(*) FROM menu_item_recipes  → 0
--   SELECT count(*) FROM inventory_items    → 0
--   SELECT count(*) FROM inventory_movements → 0
-- Empty-table state means drop+re-add is safe with zero risk of orphaning
-- existing rows.
--
-- Idempotent: every step uses IF NOT EXISTS / IF EXISTS guards.

-- ============================================================
-- 1. UNIQUE(tenant_id, id) on parent tables
-- ============================================================
-- Composite FKs require a UNIQUE/PK on the referenced columns. Both tables
-- already have PRIMARY KEY (id); we add a *redundant* UNIQUE (tenant_id, id)
-- so Postgres can resolve the composite reference. The pkey on (id) remains
-- and continues to serve as the row identity.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_menu_items_tenant_id_id_key'
      and conrelid = 'public.restaurant_menu_items'::regclass
  ) then
    alter table public.restaurant_menu_items
      add constraint restaurant_menu_items_tenant_id_id_key
      unique (tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_items_tenant_id_id_key'
      and conrelid = 'public.inventory_items'::regclass
  ) then
    alter table public.inventory_items
      add constraint inventory_items_tenant_id_id_key
      unique (tenant_id, id);
  end if;
end$$;

-- ============================================================
-- 2. Drop the old single-column FKs on menu_item_recipes
-- ============================================================
alter table public.menu_item_recipes
  drop constraint if exists menu_item_recipes_menu_item_id_fkey;

alter table public.menu_item_recipes
  drop constraint if exists menu_item_recipes_inventory_item_id_fkey;

-- ============================================================
-- 3. Add tenant-aware composite FKs (idempotent)
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'menu_item_recipes_menu_item_tenant_fkey'
      and conrelid = 'public.menu_item_recipes'::regclass
  ) then
    alter table public.menu_item_recipes
      add constraint menu_item_recipes_menu_item_tenant_fkey
      foreign key (tenant_id, menu_item_id)
      references public.restaurant_menu_items (tenant_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'menu_item_recipes_inventory_item_tenant_fkey'
      and conrelid = 'public.menu_item_recipes'::regclass
  ) then
    alter table public.menu_item_recipes
      add constraint menu_item_recipes_inventory_item_tenant_fkey
      foreign key (tenant_id, inventory_item_id)
      references public.inventory_items (tenant_id, id)
      on delete cascade;
  end if;
end$$;

-- ============================================================
-- 4. Comments for future readers
-- ============================================================
comment on constraint menu_item_recipes_menu_item_tenant_fkey
  on public.menu_item_recipes is
  'Composite FK enforcing recipe.tenant_id matches parent menu_item.tenant_id. Closes Codex P1 from PR #307. Replaces former menu_item_recipes_menu_item_id_fkey.';

comment on constraint menu_item_recipes_inventory_item_tenant_fkey
  on public.menu_item_recipes is
  'Composite FK enforcing recipe.tenant_id matches parent inventory_item.tenant_id. Closes Codex P1 from PR #307. Replaces former menu_item_recipes_inventory_item_id_fkey.';
