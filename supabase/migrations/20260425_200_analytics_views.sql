-- HIR Restaurant Suite - Analytics views (RSHIR-8)
-- All views use security_invoker = true so they inherit the caller's RLS
-- (members can only see their own tenant's rows; orders RLS already enforces this).
-- Idempotent.

-- ============================================================
-- v_orders_daily : revenue + order count + AOV per tenant per day
-- ============================================================
drop view if exists public.v_orders_daily cascade;
create view public.v_orders_daily
with (security_invoker = true) as
select
  o.tenant_id,
  date_trunc('day', o.created_at)::date as day,
  coalesce(sum(o.total_ron), 0)::numeric(12,2) as revenue,
  count(*)::bigint as order_count,
  case when count(*) = 0 then 0
       else (sum(o.total_ron) / count(*))::numeric(12,2)
  end as avg_value
from public.restaurant_orders o
where o.status <> 'CANCELLED'
group by o.tenant_id, date_trunc('day', o.created_at)::date;

-- ============================================================
-- v_top_items : top 10 line items per tenant for last 30 days
-- (orders.items is a jsonb array of line snapshots; we extract item_id +
--  name + qty + price; bins per item id.)
-- ============================================================
drop view if exists public.v_top_items cascade;
create view public.v_top_items
with (security_invoker = true) as
with line_items as (
  select
    o.tenant_id,
    coalesce(li->>'item_id', li->>'id') as item_id,
    coalesce(li->>'name', li->>'item_name', 'Unknown') as item_name,
    coalesce((li->>'quantity')::int, (li->>'qty')::int, 1) as quantity,
    coalesce((li->>'price_ron')::numeric, (li->>'price')::numeric, 0) as price_ron
  from public.restaurant_orders o
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end
  ) as li
  where o.status <> 'CANCELLED'
    and o.created_at >= now() - interval '30 days'
), aggregated as (
  select
    tenant_id,
    item_id,
    max(item_name) as item_name,
    sum(quantity)::bigint as order_count,
    sum(quantity * price_ron)::numeric(12,2) as revenue
  from line_items
  where item_id is not null
  group by tenant_id, item_id
), ranked as (
  select
    tenant_id,
    item_id,
    item_name,
    order_count,
    revenue,
    row_number() over (partition by tenant_id order by revenue desc, order_count desc) as rnk
  from aggregated
)
select tenant_id, item_id, item_name, order_count, revenue
from ranked
where rnk <= 10;

-- ============================================================
-- v_peak_hours : day-of-week (0..6, sunday=0) x hour (0..23) order counts,
--   last 30 days. Empty (dow,hour) cells are simply absent and the UI fills
--   them with zero on render.
-- ============================================================
drop view if exists public.v_peak_hours cascade;
create view public.v_peak_hours
with (security_invoker = true) as
select
  o.tenant_id,
  extract(dow from o.created_at)::int as dow,
  extract(hour from o.created_at)::int as hour,
  count(*)::bigint as order_count
from public.restaurant_orders o
where o.status <> 'CANCELLED'
  and o.created_at >= now() - interval '30 days'
group by o.tenant_id, dow, hour;

-- ============================================================
-- v_delivery_addresses_30d : lat/lng for delivered orders (heatmap), last 90d.
-- (Spec says 90 days for the geographic heatmap; the name keeps the
--  conventional 30d-style suffix the spec uses, but the window is 90.)
-- ============================================================
drop view if exists public.v_delivery_addresses_30d cascade;
create view public.v_delivery_addresses_30d
with (security_invoker = true) as
select
  o.tenant_id,
  ca.latitude as lat,
  ca.longitude as lng
from public.restaurant_orders o
join public.customer_addresses ca on ca.id = o.delivery_address_id
where o.status <> 'CANCELLED'
  and o.created_at >= now() - interval '90 days'
  and ca.latitude is not null
  and ca.longitude is not null;

-- ============================================================
-- Grants : authenticated role only (anon should not see analytics).
-- ============================================================
grant select on public.v_orders_daily          to authenticated;
grant select on public.v_top_items             to authenticated;
grant select on public.v_peak_hours            to authenticated;
grant select on public.v_delivery_addresses_30d to authenticated;
