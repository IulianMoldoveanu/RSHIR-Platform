-- Every tenant's commercial numbers were readable with the public anon key.
--
-- `mv_growth_tenant_metrics_30d` is a per-tenant 30-day rollup: revenue,
-- order and cancellation counts, average order value, unique and repeat
-- customers, growth percentages, peak hour, top items, ratings. It was
-- selectable by `anon`, and the anon key ships in the JavaScript of every
-- storefront, so this was one request away from anybody:
--
--   GET /rest/v1/mv_growth_tenant_metrics_30d?select=*
--   200 [{"tenant_slug":"...","revenue_30d":...,"aov_30d":...}, ...]
--
-- Confirmed against production with the live anon key before writing this.
--
-- A materialized view cannot carry row-level security, so the fix is the
-- grants. Every consumer is a Supabase Edge Function holding
-- SUPABASE_SERVICE_ROLE_KEY — growth-agent-daily, analytics-intents,
-- marketing-agent — and service_role bypasses grants entirely, so nothing
-- that legitimately reads this loses access. Nothing in the three Next.js
-- apps reads it at all.

revoke all on public.mv_growth_tenant_metrics_30d from anon;
revoke all on public.mv_growth_tenant_metrics_30d from authenticated;

-- Future matviews in this schema should not inherit a public read either.
alter default privileges in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------------------
-- Pin the search_path on two trigger functions.
--
-- Both ran with a role-mutable search_path, which is the hook for resolving an
-- unqualified name to an attacker-controlled object in a schema that sorts
-- earlier. Neither body references a table or a non-builtin function — they
-- only touch `new`, `old`, `now()` and `coalesce()`, all of which resolve from
-- pg_catalog regardless — so pinning is safe.
--
-- Deliberately `alter function` rather than `create or replace`: the bodies
-- live in production and are not worth retyping from a migration file. That
-- mistake has already cost this project four live guards once.
alter function public.stamp_courier_assigned_at() set search_path = '';
alter function public.stamp_restaurant_order_ready_at() set search_path = '';
