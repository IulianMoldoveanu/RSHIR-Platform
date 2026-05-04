-- HIR AI CEO — Phase 5 Growth Agent
-- Daily Sonnet 4.5 pass over per-tenant 30d metrics → operator-gated
-- recommendations stored in growth_recommendations + Telegram digest.
--
-- Idempotent. Adds:
--   1. growth_recommendations table (operator-gated; auto_action_available=false initial)
--   2. mv_growth_tenant_metrics_30d  materialized view (refresh daily 05:55 UTC)
--   3. v_growth_cuisine_benchmark    view (peer benchmark, min 3 tenants per cuisine)
--   4. RLS: tenant members read own rows, platform admins read all, service role writes
--   5. pg_cron job: refresh-growth-mv-daily @ 05:55 UTC

-- ============================================================
-- TABLE: growth_recommendations
-- ============================================================
create table if not exists public.growth_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  generated_at timestamptz not null default now(),
  -- Categories the Growth Agent emits (Romanian copy stored separately).
  category text not null check (category in (
    'menu_pricing',
    'menu_assortment',
    'operations',
    'marketing',
    'retention',
    'reviews',
    'delivery_zones',
    'reseller_pitch'
  )),
  -- 'critical' | 'high' | 'medium' | 'low' — surfaced in Telegram digest.
  priority text not null default 'medium' check (priority in ('critical','high','medium','low')),
  title_ro text not null,
  rationale_ro text not null,
  suggested_action_ro text not null,
  -- Optional structured payload (e.g. {item_id, new_price_ron} for menu_pricing).
  payload jsonb not null default '{}'::jsonb,
  -- Operator gate: tonight every recommendation ships with auto_action_available=false.
  auto_action_available boolean not null default false,
  -- Workflow: pending → approved/dismissed by operator → applied (when auto exists).
  status text not null default 'pending' check (status in (
    'pending','approved','dismissed','applied','expired'
  )),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  -- Telemetry from the Sonnet call that produced this row.
  cost_usd numeric(10,6) not null default 0,
  model text not null default 'claude-sonnet-4-5-20250929',
  created_at timestamptz not null default now()
);

create index if not exists idx_growth_recs_tenant_status
  on public.growth_recommendations (tenant_id, status, generated_at desc);
create index if not exists idx_growth_recs_priority
  on public.growth_recommendations (priority, generated_at desc);

-- updated trigger reuses public.touch_updated_at? table has no updated_at so skip.

alter table public.growth_recommendations enable row level security;

drop policy if exists growth_recs_tenant_member_read on public.growth_recommendations;
create policy growth_recs_tenant_member_read
  on public.growth_recommendations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = growth_recommendations.tenant_id
        and tm.user_id  = auth.uid()
    )
  );

drop policy if exists growth_recs_platform_admin_read on public.growth_recommendations;
create policy growth_recs_platform_admin_read
  on public.growth_recommendations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.platform_admins pa
      where pa.user_id = auth.uid()
    )
  );

drop policy if exists growth_recs_tenant_member_decide on public.growth_recommendations;
create policy growth_recs_tenant_member_decide
  on public.growth_recommendations
  for update
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = growth_recommendations.tenant_id
        and tm.user_id  = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = growth_recommendations.tenant_id
        and tm.user_id  = auth.uid()
    )
  );

-- service_role bypasses RLS automatically; explicit grants for safety.
grant select, update on public.growth_recommendations to authenticated;

-- ============================================================
-- MATERIALIZED VIEW: mv_growth_tenant_metrics_30d
-- Pre-computed per-tenant 30-day snapshot to feed the Sonnet prompt.
-- Refreshed daily at 05:55 UTC (10 min before Growth Agent runs at 06:00).
-- COALESCE handles tenants with zero orders (no NaN, no nulls).
-- ============================================================
drop materialized view if exists public.mv_growth_tenant_metrics_30d cascade;
create materialized view public.mv_growth_tenant_metrics_30d as
with order_window as (
  select
    o.tenant_id,
    o.id,
    o.total_ron,
    o.subtotal_ron,
    o.delivery_fee_ron,
    o.status,
    o.created_at,
    o.customer_id,
    o.delivery_address_id,
    o.items
  from public.restaurant_orders o
  where o.created_at >= now() - interval '30 days'
), prior_window as (
  select
    o.tenant_id,
    count(*) filter (where o.status <> 'CANCELLED') as prior_orders,
    coalesce(sum(o.total_ron) filter (where o.status <> 'CANCELLED'), 0)::numeric(12,2) as prior_revenue
  from public.restaurant_orders o
  where o.created_at >= now() - interval '60 days'
    and o.created_at <  now() - interval '30 days'
  group by o.tenant_id
), order_stats as (
  select
    tenant_id,
    count(*) filter (where status <> 'CANCELLED')                                              as orders_30d,
    count(*) filter (where status = 'CANCELLED')                                               as cancels_30d,
    coalesce(sum(total_ron) filter (where status <> 'CANCELLED'), 0)::numeric(12,2)            as revenue_30d,
    coalesce(avg(total_ron) filter (where status <> 'CANCELLED'), 0)::numeric(12,2)            as aov_30d,
    coalesce(avg(delivery_fee_ron) filter (where status <> 'CANCELLED'), 0)::numeric(12,2)     as avg_delivery_fee,
    count(distinct customer_id) filter (where status <> 'CANCELLED' and customer_id is not null) as unique_customers_30d
  from order_window
  group by tenant_id
), repeat_stats as (
  -- Customers with >= 2 orders in window = repeat
  select
    tenant_id,
    count(*) filter (where order_count >= 2) as repeat_customers_30d,
    count(*)                                  as customers_with_any_order
  from (
    select tenant_id, customer_id, count(*) as order_count
    from order_window
    where status <> 'CANCELLED' and customer_id is not null
    group by tenant_id, customer_id
  ) t
  group by tenant_id
), peak_hour AS (
  select distinct on (tenant_id)
    tenant_id,
    extract(hour from created_at)::int as peak_hour,
    count(*) over (partition by tenant_id, extract(hour from created_at)::int) as peak_hour_count
  from order_window
  where status <> 'CANCELLED'
  order by tenant_id, peak_hour_count desc
), top_items AS (
  select
    tenant_id,
    jsonb_agg(jsonb_build_object(
      'item_id', item_id,
      'name', item_name,
      'qty', qty,
      'revenue', rev
    ) order by rev desc) filter (where rnk <= 5) as top_items_json
  from (
    select
      tenant_id,
      coalesce(li->>'item_id', li->>'id')                              as item_id,
      coalesce(li->>'name', li->>'item_name', 'Necunoscut')             as item_name,
      sum(coalesce((li->>'quantity')::int, (li->>'qty')::int, 1))       as qty,
      sum(
        coalesce((li->>'quantity')::int, (li->>'qty')::int, 1) *
        coalesce((li->>'price_ron')::numeric, (li->>'price')::numeric, 0)
      )::numeric(12,2)                                                   as rev,
      row_number() over (
        partition by tenant_id
        order by sum(
          coalesce((li->>'quantity')::int, (li->>'qty')::int, 1) *
          coalesce((li->>'price_ron')::numeric, (li->>'price')::numeric, 0)
        ) desc
      ) as rnk
    from order_window o
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end
    ) li
    where o.status <> 'CANCELLED'
      and coalesce(li->>'item_id', li->>'id') is not null
    group by tenant_id, coalesce(li->>'item_id', li->>'id'), coalesce(li->>'name', li->>'item_name', 'Necunoscut')
  ) ranked
  group by tenant_id
), menu_stats as (
  select
    mi.tenant_id,
    count(*)                                       as menu_item_count,
    count(*) filter (where mi.is_available = true) as menu_items_available,
    count(*) filter (where mi.image_url is null or mi.image_url = '') as menu_items_no_image
  from public.restaurant_menu_items mi
  group by mi.tenant_id
), review_stats as (
  -- restaurant_reviews exists per migration 20260430_001 — safe to reference.
  select
    rr.tenant_id,
    count(*)                                                       as reviews_count_30d,
    coalesce(round(avg(rr.rating)::numeric, 2), 0)::numeric(3,2)   as avg_rating_30d,
    count(*) filter (where rr.rating <= 3)                         as low_ratings_30d
  from public.restaurant_reviews rr
  where rr.created_at >= now() - interval '30 days'
  group by rr.tenant_id
), zone_stats as (
  select
    dz.tenant_id,
    count(*) filter (where dz.is_active = true) as active_zones
  from public.delivery_zones dz
  group by dz.tenant_id
)
select
  t.id                                                       as tenant_id,
  t.slug                                                     as tenant_slug,
  t.name                                                     as tenant_name,
  t.status                                                   as tenant_status,
  t.vertical                                                 as tenant_vertical,
  -- jsonb path: settings.cuisine_types (array of strings); fallback to vertical.
  coalesce(t.settings->'cuisine_types', '[]'::jsonb)         as cuisine_types,
  coalesce(os.orders_30d, 0)                                 as orders_30d,
  coalesce(os.cancels_30d, 0)                                as cancels_30d,
  coalesce(os.revenue_30d, 0)::numeric(12,2)                 as revenue_30d,
  coalesce(os.aov_30d, 0)::numeric(12,2)                     as aov_30d,
  coalesce(os.avg_delivery_fee, 0)::numeric(12,2)            as avg_delivery_fee,
  coalesce(os.unique_customers_30d, 0)                       as unique_customers_30d,
  coalesce(rs.repeat_customers_30d, 0)                       as repeat_customers_30d,
  coalesce(pw.prior_orders, 0)                               as prior_orders_30d,
  coalesce(pw.prior_revenue, 0)::numeric(12,2)               as prior_revenue_30d,
  case
    when coalesce(pw.prior_orders, 0) = 0 then null
    else round(((coalesce(os.orders_30d, 0) - pw.prior_orders)::numeric / pw.prior_orders) * 100, 2)
  end                                                        as orders_growth_pct,
  case
    when coalesce(pw.prior_revenue, 0) = 0 then null
    else round(((coalesce(os.revenue_30d, 0) - pw.prior_revenue) / pw.prior_revenue) * 100, 2)
  end                                                        as revenue_growth_pct,
  ph.peak_hour                                               as peak_hour,
  coalesce(ti.top_items_json, '[]'::jsonb)                   as top_items,
  coalesce(ms.menu_item_count, 0)                            as menu_item_count,
  coalesce(ms.menu_items_available, 0)                       as menu_items_available,
  coalesce(ms.menu_items_no_image, 0)                        as menu_items_no_image,
  coalesce(rv.reviews_count_30d, 0)                          as reviews_count_30d,
  coalesce(rv.avg_rating_30d, 0)::numeric(3,2)               as avg_rating_30d,
  coalesce(rv.low_ratings_30d, 0)                            as low_ratings_30d,
  coalesce(zs.active_zones, 0)                               as active_zones,
  now()                                                      as snapshot_at
from public.tenants t
left join order_stats   os on os.tenant_id = t.id
left join repeat_stats  rs on rs.tenant_id = t.id
left join prior_window  pw on pw.tenant_id = t.id
left join peak_hour     ph on ph.tenant_id = t.id
left join top_items     ti on ti.tenant_id = t.id
left join menu_stats    ms on ms.tenant_id = t.id
left join review_stats  rv on rv.tenant_id = t.id
left join zone_stats    zs on zs.tenant_id = t.id
where t.vertical = 'RESTAURANT'
  and t.status   = 'ACTIVE';

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
create unique index if not exists ux_mv_growth_tenant_metrics_30d_tenant
  on public.mv_growth_tenant_metrics_30d (tenant_id);

-- Service role + authenticated read (RLS does not apply to MVs; access is grant-based).
grant select on public.mv_growth_tenant_metrics_30d to service_role;

-- ============================================================
-- VIEW: v_growth_cuisine_benchmark
-- Anonymous peer benchmark per cuisine. Min 3 tenants gate to prevent
-- de-anonymisation. cuisine_types is jsonb array — we explode + group.
-- ============================================================
drop view if exists public.v_growth_cuisine_benchmark cascade;
create view public.v_growth_cuisine_benchmark
with (security_invoker = false) as
with exploded as (
  select
    jsonb_array_elements_text(
      case when jsonb_typeof(cuisine_types) = 'array' then cuisine_types else '[]'::jsonb end
    ) as cuisine,
    orders_30d,
    revenue_30d,
    aov_30d,
    avg_rating_30d,
    repeat_customers_30d,
    unique_customers_30d
  from public.mv_growth_tenant_metrics_30d
), grouped as (
  select
    cuisine,
    count(*)                                              as tenant_count,
    round(avg(orders_30d)::numeric, 1)                    as avg_orders_30d,
    round(avg(revenue_30d)::numeric, 2)                   as avg_revenue_30d,
    round(avg(aov_30d)::numeric, 2)                       as avg_aov_30d,
    round(avg(avg_rating_30d)::numeric, 2)                as avg_rating_30d,
    case
      when sum(unique_customers_30d) = 0 then 0
      else round((sum(repeat_customers_30d)::numeric / sum(unique_customers_30d)) * 100, 2)
    end                                                   as avg_repeat_rate_pct
  from exploded
  group by cuisine
)
select * from grouped where tenant_count >= 3;

grant select on public.v_growth_cuisine_benchmark to service_role;

-- ============================================================
-- pg_cron: refresh the MV daily at 05:55 UTC (Growth Agent runs at 06:00).
-- Idempotent: drop-then-recreate same-named job.
-- ============================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'refresh-growth-mv-daily';
    perform cron.schedule(
      'refresh-growth-mv-daily',
      '55 5 * * *',
      $cron$ refresh materialized view concurrently public.mv_growth_tenant_metrics_30d; $cron$
    );
  end if;
end
$$;

-- Initial population so first dry-run smoke isn't empty.
refresh materialized view public.mv_growth_tenant_metrics_30d;
