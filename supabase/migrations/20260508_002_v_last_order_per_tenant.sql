-- Lane NATIONAL-SCALE-HARDENING — N+1 fix for the platform-admin tenant grid.
--
-- Background: `/dashboard/admin/tenants` was issuing one query per tenant to
-- fetch the most recent non-CANCELLED order timestamp. At ≤50 tenants this
-- was bounded; at the 100-tenant target for EOY 2026 the fan-out becomes
-- the dominant cost on the page (100 sequential or parallel queries each
-- doing an indexed scan with `LIMIT 1`).
--
-- This view exposes one row per tenant_id with the last non-CANCELLED order
-- timestamp, computed in the database via a single GROUP BY scan. Postgres
-- can satisfy this from the existing `(tenant_id, created_at desc)` index
-- on `restaurant_orders` (idx_restaurant_orders_tenant_created in
-- 20260425_000_initial.sql).
--
-- Read access: same surface as `restaurant_orders` — security_invoker so
-- members only see their own tenant's row, and platform-admin (via
-- service-role admin client) sees everything.
--
-- Fully additive + idempotent.

drop view if exists public.v_last_order_per_tenant cascade;

create view public.v_last_order_per_tenant
with (security_invoker = true) as
select
  o.tenant_id,
  max(o.created_at) as last_order_at
from public.restaurant_orders o
where o.status <> 'CANCELLED'
group by o.tenant_id;

comment on view public.v_last_order_per_tenant is
  'One row per tenant: most recent non-CANCELLED order timestamp. Replaces the per-tenant N+1 fan-out on /dashboard/admin/tenants. security_invoker=true so callers see only rows their RLS allows.';
