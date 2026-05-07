-- Pre-orders (advance/scheduled orders) — minimal additive slice.
--
-- Distribution context: cofetărie + catering + restaurant familial pilot
-- segments need scheduled-pickup/delivery for events ("vreau tort marți la
-- 18:00", "10 platouri sâmbătă la prânz"). GloriaFood does NOT support this.
--
-- Design (per discovery 2026-05-08):
-- - REUSE restaurant_orders. Add `scheduled_for` + `is_pre_order` columns.
--   Pre-orders are full restaurant_orders rows; payments / items / status /
--   RLS / dispatch all reuse existing infrastructure.
-- - Settings live under tenants.settings.pre_orders (jsonb), mirroring the
--   established smartbill / branding / loyalty pattern. No new settings table.
-- - Default OFF per tenant. OWNER opts in from /dashboard/pre-orders.
--
-- Deferred to follow-up lane:
-- - Calendar view "Săptămâna viitoare"
-- - Hepy intent /precomenzi
-- - 24h-before reminder cron + email
-- - Customer email confirmation (V1: OWNER calls customer manually)
--
-- Idempotent. Re-runnable.

-- ============================================================
-- 1. restaurant_orders: scheduled_for + is_pre_order
-- ============================================================
alter table public.restaurant_orders
  add column if not exists scheduled_for timestamptz,
  add column if not exists is_pre_order boolean not null default false;

-- Partial index: most queries are "list pre-orders for tenant by scheduled_for".
-- Excluding regular orders keeps the index small (~1% of total rows expected).
create index if not exists idx_orders_pre_order_tenant_scheduled
  on public.restaurant_orders (tenant_id, scheduled_for)
  where is_pre_order = true;

-- Sanity guard: a row flagged as pre-order MUST have a scheduled_for.
-- Use a CHECK so any future code path that flips is_pre_order without
-- setting the timestamp fails loudly at write time, not silently in the UI.
do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'restaurant_orders'
      and constraint_name = 'restaurant_orders_pre_order_requires_schedule'
  ) then
    alter table public.restaurant_orders
      add constraint restaurant_orders_pre_order_requires_schedule
      check (is_pre_order = false or scheduled_for is not null);
  end if;
end$$;

-- ============================================================
-- 2. Comment: tenants.settings.pre_orders shape
-- ============================================================
-- Settings nested under tenants.settings.pre_orders (jsonb). No schema change
-- required — tenants.settings is jsonb default '{}'. Default-off behavior is
-- enforced in application code (readPreOrderSettings).
--
--   {
--     "enabled": false,                  -- master toggle (OWNER opt-in)
--     "min_advance_hours": 24,           -- earliest acceptable lead time
--     "max_advance_days": 14,            -- latest acceptable booking horizon
--     "min_subtotal_ron": 0              -- optional minimum (catering ≥ 200)
--   }
