-- HIR Restaurant Suite — Phase 1 of "external platform source" feature.
-- Extends the existing public.order_source enum with 5 aggregator values so
-- restaurant_orders.source can record WHICH external platform an order came
-- from when Phase 2 wires the per-platform webhooks (Glovo first, then the
-- rest). Until Phase 2 ships, the values exist in the DB but no code path
-- writes them, so this migration is a true no-op for current pilots.
--
-- Idempotent: ALTER TYPE ... ADD VALUE IF NOT EXISTS is safe to re-run.
-- Order: alphabetical-ish by sales-pipeline priority (Glovo first per Y1
-- request 2026-05-05).
--
-- Postgres rule: ADD VALUE cannot run inside an explicit transaction block,
-- so each statement stands alone. supabase/apply-sql.mjs already executes
-- each statement separately via the Mgmt API — no transaction wrapper here.

alter type public.order_source add value if not exists 'GLOVO';
alter type public.order_source add value if not exists 'WOLT';
alter type public.order_source add value if not exists 'TAZZ';
alter type public.order_source add value if not exists 'FOODPANDA';
alter type public.order_source add value if not exists 'BOLT_FOOD';
