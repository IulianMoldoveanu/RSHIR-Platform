-- Lane AGGREGATOR-EMAIL-INTAKE — atomic dedup hardening.
--
-- Codex P1 follow-up on PR #308 (commit d445037): the read-before-insert
-- guard in aggregator-email-parser is racy. Two concurrent retries of the
-- same email can both pass the SELECT before either order exists, then
-- both insert paid CONFIRMED restaurant_orders. The fix needs to be at
-- the database layer — application-level checks cannot serialize without
-- a lock.
--
-- Design: store the aggregator's external order id in
-- restaurant_orders.hir_delivery_id (existing nullable text column,
-- otherwise unused for aggregator orders) and add a UNIQUE partial
-- index on (tenant_id, source, hir_delivery_id) for the aggregator
-- sources only. The Edge Function then uses INSERT ... ON CONFLICT DO
-- NOTHING and falls back to a deterministic lookup on conflict.
--
-- Why a partial index:
--   • Existing rows from non-aggregator sources may have hir_delivery_id
--     populated with HIR's internal delivery id (HIR Direct / Fleet);
--     a global unique constraint would reject those. Restricting to
--     source IN ('GLOVO','WOLT','BOLT_FOOD') leaves them untouched.
--   • Real production data sanity-checked: all current GLOVO/WOLT/
--     BOLT_FOOD rows are zero (no aggregator ingestion has fired yet),
--     so creating the index is non-blocking.
--
-- Idempotent. Re-running is a no-op.

create unique index if not exists
  restaurant_orders_aggregator_external_id_uniq
  on public.restaurant_orders (tenant_id, source, hir_delivery_id)
  where source in ('GLOVO','WOLT','BOLT_FOOD','TAZZ','FOODPANDA')
    and hir_delivery_id is not null;

comment on index public.restaurant_orders_aggregator_external_id_uniq is
  'Atomic dedup for aggregator-sourced orders (GLOVO/WOLT/BOLT_FOOD/etc): '
  'guarantees no two rows share (tenant_id, source, hir_delivery_id) where '
  'hir_delivery_id stores the aggregator external order id. Used by '
  'aggregator-email-parser Edge Function via INSERT ... ON CONFLICT.';
