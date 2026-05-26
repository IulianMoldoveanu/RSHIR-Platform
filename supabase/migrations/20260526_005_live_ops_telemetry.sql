-- Wave 3 — Cross-system telemetry view + proactive alerts log.
--
-- A single SQL surface that the admin Control Room (Wave 4) and the
-- proactive alerts cron (this PR) both consume. Lifts the operational
-- pulse of every tenant into one place — queue depth, dispatch lag,
-- courier-side health — so the system can preempt problems instead of
-- waiting for someone to call.

-- ── 1. live_ops_telemetry view ────────────────────────────────────────

drop view if exists public.live_ops_telemetry;
create view public.live_ops_telemetry as
with active_orders as (
  select
    o.tenant_id,
    count(*) filter (
      where o.status in ('PENDING','CONFIRMED','PREPARING','READY')
    ) as kitchen_queue,
    count(*) filter (
      where o.status in ('DISPATCHED','IN_DELIVERY')
    ) as in_courier_flow,
    count(*) filter (
      where o.status = 'DISPATCHED'
        and o.updated_at < now() - interval '5 minutes'
    ) as dispatched_unpicked_over_5m,
    count(*) filter (
      where o.status in ('PENDING','CONFIRMED','PREPARING','READY')
        and o.created_at < now() - interval '15 minutes'
    ) as kitchen_overdue_over_15m,
    max(o.created_at) as last_order_at
  from public.restaurant_orders o
  where o.created_at >= now() - interval '24 hours'
  group by o.tenant_id
),
recent_revenue as (
  select
    tenant_id,
    coalesce(sum(total_ron), 0) as revenue_24h_ron,
    count(*) as delivered_24h
  from public.restaurant_orders
  where status = 'DELIVERED'
    and updated_at >= now() - interval '24 hours'
  group by tenant_id
)
select
  t.id                                            as tenant_id,
  t.name                                          as tenant_name,
  t.slug                                          as tenant_slug,
  t.city_id                                       as city_id,
  t.delivery_mode                                 as delivery_mode,
  coalesce(a.kitchen_queue, 0)                    as kitchen_queue,
  coalesce(a.in_courier_flow, 0)                  as in_courier_flow,
  coalesce(a.dispatched_unpicked_over_5m, 0)      as dispatched_unpicked_over_5m,
  coalesce(a.kitchen_overdue_over_15m, 0)         as kitchen_overdue_over_15m,
  a.last_order_at                                 as last_order_at,
  coalesce(r.delivered_24h, 0)                    as delivered_24h,
  coalesce(r.revenue_24h_ron, 0)::numeric(12, 2)  as revenue_24h_ron
from public.tenants t
left join active_orders a on a.tenant_id = t.id
left join recent_revenue r on r.tenant_id = t.id
where t.status = 'ACTIVE';

comment on view public.live_ops_telemetry is
  'Wave 3 — per-tenant operational pulse over the last 24h. kitchen_queue + '
  'in_courier_flow show active load; dispatched_unpicked_over_5m and '
  'kitchen_overdue_over_15m surface friction points the Control Room and the '
  'proactive alerts cron act on. revenue_24h_ron + delivered_24h are baseline '
  'business pulse.';

-- ── 2. ops_alerts table ───────────────────────────────────────────────

create table if not exists public.ops_alerts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id) on delete cascade,
  alert_type  text not null,
  severity    text not null check (severity in ('INFO','WARN','CRIT')),
  message     text not null,
  metadata    jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists ix_ops_alerts_created
  on public.ops_alerts(created_at desc);
create index if not exists ix_ops_alerts_unresolved
  on public.ops_alerts(created_at desc) where resolved_at is null;
create index if not exists ix_ops_alerts_tenant
  on public.ops_alerts(tenant_id, created_at desc) where tenant_id is not null;

-- Dedupe (tenant_id, alert_type, hourly window) is enforced in the cron
-- itself (Edge Function checks for an unresolved row in the last 30
-- minutes before inserting). A DB unique index on a date_trunc expression
-- would need an IMMUTABLE wrapper and adds little value over the
-- application-side check.

alter table public.ops_alerts enable row level security;

-- Platform admins read; nobody writes via REST (service role only).
drop policy if exists "ops_alerts_admin_select" on public.ops_alerts;
create policy "ops_alerts_admin_select" on public.ops_alerts
  for select using (
    auth.jwt() ->> 'email' in (
      select unnest(string_to_array(coalesce(current_setting('app.platform_admin_emails', true), ''), ','))
    )
  );

comment on table public.ops_alerts is
  'Wave 3 — proactive alerts emitted by ops-alerts-tick Edge Function. '
  'Service role inserts; platform admins read. Dedupe key (tenant_id, '
  'alert_type, hour) prevents spam.';
