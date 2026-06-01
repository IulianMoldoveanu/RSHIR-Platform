-- Command Center CC4b: per-city vendor + delivery rollup view.
--
-- Powers /dashboard/admin/cities — Iulian's "control absolut pe orașe" surface:
-- every RO city with how many vendors operate there and how much the shared
-- courier spine moves through it. One GROUP BY scan instead of a 12-city N+1,
-- mirroring v_last_order_per_tenant (20260508_002).
--
-- Vendors = tenants.city_id (restaurant vendors live here; pharma is canonical
-- in Neon and only mirrors ORDERS into courier_orders, so it has no tenant row).
-- Orders = courier_orders.city_id, the cross-vertical spine. NOTE: the pharma
-- mirror does not yet stamp city_id, so pharma deliveries fall into the
-- city_id-NULL bucket (surfaced separately by the page), not into any city row.
-- Restaurant orders are stamped on dispatch by sync_restaurant_to_courier_order
-- (MC1, 20260630_016).
--
-- security_invoker=true → service-role admin sees all; any authenticated caller
-- sees only what their RLS allows (no privilege escalation). Same surface as
-- v_last_order_per_tenant. Additive + idempotent.

drop view if exists public.v_city_delivery_rollup cascade;

create view public.v_city_delivery_rollup
with (security_invoker = true) as
with vendor_agg as (
  select city_id, count(*)::int as vendor_count
  from public.tenants
  where city_id is not null
  group by city_id
),
order_agg as (
  select
    city_id,
    count(*)::int as orders_total,
    (count(*) filter (where created_at >= now() - interval '30 days'))::int as orders_30d,
    (count(*) filter (
       where status in ('CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT')
     ))::int as orders_in_progress
  from public.courier_orders
  where city_id is not null
  group by city_id
)
select
  c.id as city_id,
  c.name,
  c.slug,
  c.county,
  c.sort_order,
  c.is_active,
  coalesce(v.vendor_count, 0) as vendor_count,
  coalesce(o.orders_total, 0) as orders_total,
  coalesce(o.orders_30d, 0) as orders_30d,
  coalesce(o.orders_in_progress, 0) as orders_in_progress
from public.cities c
left join vendor_agg v on v.city_id = c.id
left join order_agg o on o.city_id = c.id;

comment on view public.v_city_delivery_rollup is
  'CC4b: one row per city with vendor_count (tenants.city_id) + order rollups '
  'from the shared courier_orders spine (total / last-30d / in-progress). Powers '
  '/dashboard/admin/cities. Pharma orders are not yet city-stamped (mirror gap) '
  'and sit in the city_id-NULL bucket, not here. security_invoker=true.';
