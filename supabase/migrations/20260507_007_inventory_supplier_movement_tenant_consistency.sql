-- Lane INVENTORY-V1 follow-up #2 (2026-05-07) — composite-FK tenant
-- consistency on supplier links + inventory_movements. Closes Codex P2 x2
-- from PR #307 re-review at SHA a2bf72e.
--
-- Same pattern as 20260507_006: replace single-column FKs with composite
-- (tenant_id, *_id) FKs against parent unique (tenant_id, id) so Postgres
-- enforces tenant alignment at INSERT/UPDATE time.
--
-- Affected FKs:
--   inventory_items.supplier_id    → suppliers(tenant_id, id)
--   purchase_orders.supplier_id    → suppliers(tenant_id, id)
--   inventory_movements.inventory_item_id
--                                  → inventory_items(tenant_id, id)
--
-- Pre-write probe (Mgmt API, 2026-05-07): items=0, suppliers=0, pos=0,
-- movs=0. Empty-table state means drop+re-add is safe.
--
-- Idempotent: every step uses IF NOT EXISTS / IF EXISTS guards.

-- ============================================================
-- 1. UNIQUE(tenant_id, id) on suppliers
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'suppliers_tenant_id_id_key'
      and conrelid = 'public.suppliers'::regclass
  ) then
    alter table public.suppliers
      add constraint suppliers_tenant_id_id_key
      unique (tenant_id, id);
  end if;
end$$;

-- (inventory_items already has inventory_items_tenant_id_id_key from 006)

-- ============================================================
-- 2. inventory_items.supplier_id — composite FK
-- ============================================================
alter table public.inventory_items
  drop constraint if exists inventory_items_supplier_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_items_supplier_tenant_fkey'
      and conrelid = 'public.inventory_items'::regclass
  ) then
    alter table public.inventory_items
      add constraint inventory_items_supplier_tenant_fkey
      foreign key (tenant_id, supplier_id)
      references public.suppliers (tenant_id, id)
      on delete set null;
  end if;
end$$;

comment on constraint inventory_items_supplier_tenant_fkey
  on public.inventory_items is
  'Composite FK enforcing inventory_item.tenant_id matches supplier.tenant_id. Closes Codex P2 from PR #307 re-review. Replaces former inventory_items_supplier_id_fkey.';

-- ============================================================
-- 3. purchase_orders.supplier_id — composite FK
-- ============================================================
alter table public.purchase_orders
  drop constraint if exists purchase_orders_supplier_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_orders_supplier_tenant_fkey'
      and conrelid = 'public.purchase_orders'::regclass
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_supplier_tenant_fkey
      foreign key (tenant_id, supplier_id)
      references public.suppliers (tenant_id, id)
      on delete set null;
  end if;
end$$;

comment on constraint purchase_orders_supplier_tenant_fkey
  on public.purchase_orders is
  'Composite FK enforcing purchase_order.tenant_id matches supplier.tenant_id. Closes Codex P2 from PR #307 re-review. Replaces former purchase_orders_supplier_id_fkey.';

-- ============================================================
-- 4. inventory_movements.inventory_item_id — composite FK
-- ============================================================
alter table public.inventory_movements
  drop constraint if exists inventory_movements_inventory_item_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_movements_item_tenant_fkey'
      and conrelid = 'public.inventory_movements'::regclass
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_item_tenant_fkey
      foreign key (tenant_id, inventory_item_id)
      references public.inventory_items (tenant_id, id)
      on delete cascade;
  end if;
end$$;

comment on constraint inventory_movements_item_tenant_fkey
  on public.inventory_movements is
  'Composite FK enforcing movement.tenant_id matches inventory_item.tenant_id. Closes Codex P2 from PR #307 re-review. Replaces former inventory_movements_inventory_item_id_fkey.';
