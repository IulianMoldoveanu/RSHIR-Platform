-- Lane INVENTORY-V1 follow-up #3 (2026-05-07) — fix composite-FK
-- ON DELETE SET NULL semantics. Closes Codex P2 x2 from PR #307 review at
-- SHA f610213.
--
-- Problem: Postgres composite FK `(tenant_id, supplier_id)
-- REFERENCES suppliers(tenant_id, id) ON DELETE SET NULL` nulls EVERY
-- referencing column on parent delete, not just supplier_id. Because
-- inventory_items.tenant_id and purchase_orders.tenant_id are NOT NULL,
-- deleting any supplier with referencing children raises a not-null
-- violation. Reproduced live via Mgmt API on 2026-05-07.
--
-- Fix: PG 15+ column-list syntax `ON DELETE SET NULL (supplier_id)` so
-- only supplier_id is nulled, tenant_id is preserved. Postgres version
-- on prod: 17 — supported.
--
-- inventory_movements.inventory_item_id FK uses ON DELETE CASCADE so it
-- is unaffected. Only the two SET NULL FKs from migration 007 need fixing.
--
-- Pre-write probe (Mgmt API, 2026-05-07): items=0, suppliers=0, pos=0.
-- Empty-table state means drop+re-add is safe.
--
-- Idempotent: every step uses IF NOT EXISTS / IF EXISTS guards.

-- ============================================================
-- 1. inventory_items.supplier_tenant_fkey — add column-list
-- ============================================================
alter table public.inventory_items
  drop constraint if exists inventory_items_supplier_tenant_fkey;

alter table public.inventory_items
  add constraint inventory_items_supplier_tenant_fkey
  foreign key (tenant_id, supplier_id)
  references public.suppliers (tenant_id, id)
  on delete set null (supplier_id);

comment on constraint inventory_items_supplier_tenant_fkey
  on public.inventory_items is
  'Composite FK enforcing inventory_item.tenant_id matches supplier.tenant_id. ON DELETE SET NULL targets only supplier_id (PG 15+ column-list) so tenant_id is preserved on supplier delete. Closes Codex P1 + P2 x2 from PR #307.';

-- ============================================================
-- 2. purchase_orders.supplier_tenant_fkey — add column-list
-- ============================================================
alter table public.purchase_orders
  drop constraint if exists purchase_orders_supplier_tenant_fkey;

alter table public.purchase_orders
  add constraint purchase_orders_supplier_tenant_fkey
  foreign key (tenant_id, supplier_id)
  references public.suppliers (tenant_id, id)
  on delete set null (supplier_id);

comment on constraint purchase_orders_supplier_tenant_fkey
  on public.purchase_orders is
  'Composite FK enforcing purchase_order.tenant_id matches supplier.tenant_id. ON DELETE SET NULL targets only supplier_id (PG 15+ column-list) so tenant_id is preserved on supplier delete. Closes Codex P1 + P2 x2 from PR #307.';
