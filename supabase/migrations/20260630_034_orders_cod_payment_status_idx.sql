-- Audit P17 — partial composite index for the COD-reconciliation panel.
--
-- The admin "Cash neîncasat" filter scans restaurant_orders for rows where
-- payment_method='COD' AND payment_status IS NOT 'PAID' (UNPAID/PENDING).
-- We have two existing indexes:
--   1) restaurant_orders_payment_method_idx (tenant_id, payment_method)
--      WHERE payment_method='COD' — finds COD orders fast but the planner
--      still has to fetch each row to test payment_status.
--   2) restaurant_orders_tenant_payment_status_idx (tenant_id, payment_status)
--      — non-partial, covers ALL rows incl. the much-larger CARD majority.
--
-- This composite partial trades a small extra B-tree (only COD rows,
-- typically < 30% of the table on a Romanian SKU mix) for an index-only
-- scan on the COD reconciliation queue. No-op write impact: only COD
-- inserts/updates touch it, and those are already the slow path.
--
-- Idempotent: IF NOT EXISTS guards both passes. Safe to re-apply.
-- Non-CONCURRENTLY to avoid the "cannot run inside a transaction block"
-- error the Supabase migration runner raises on CONCURRENT DDL — this
-- table is small enough on every tenant that a brief lock is fine.

create index if not exists restaurant_orders_cod_payment_status_idx
  on public.restaurant_orders (tenant_id, payment_status)
  where payment_method = 'COD';
