-- Demand Forecast — daily hourly order volume predictions per tenant.
--
-- Table: demand_forecast_cells
--   One row per (tenant_id, day_of_week, hour_of_day) — 7×24 = 168 cells max
--   per tenant. Upserted daily by the demand-forecast-daily Edge Function at
--   04:00 UTC.
--
-- Algorithm (pure stats, no ML):
--   forecast_count = mean_count × trend_ratio  (clamped to [0.5, 2.0] × mean)
--   trend_ratio    = avg(last 2 weeks) / avg(weeks 3-8)  — captures growth
--   95% CI bounds  = mean ± 1.96 × std / sqrt(n)
--
-- Cold-start: sample_weeks < 4 → widget shows message, not heatmap.
--
-- RLS:
--   authenticated tenant members → SELECT only
--   service-role (Edge Function)  → INSERT / UPDATE (via upsert)
--   anon                          → nothing

create table if not exists public.demand_forecast_cells (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references public.tenants(id) on delete cascade,
  day_of_week     smallint    not null check (day_of_week between 0 and 6),
  hour_of_day     smallint    not null check (hour_of_day between 0 and 23),
  forecast_count  numeric(8,2) not null default 0,
  mean_count      numeric(8,2) not null default 0,
  std_count       numeric(8,2) not null default 0,
  trend_ratio     numeric(6,4) not null default 1.0,
  ci_lower        numeric(8,2) not null default 0,
  ci_upper        numeric(8,2) not null default 0,
  sample_weeks    smallint    not null default 0,
  computed_at     timestamptz not null default now()
);

-- Upsert uniqueness — one cell per bucket per tenant.
create unique index if not exists uq_demand_forecast_cells_bucket
  on public.demand_forecast_cells (tenant_id, day_of_week, hour_of_day);

create index if not exists idx_demand_forecast_cells_tenant
  on public.demand_forecast_cells (tenant_id);

alter table public.demand_forecast_cells enable row level security;

-- Tenant members may read their own forecast.
create policy "tenant members can read forecast"
  on public.demand_forecast_cells
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = demand_forecast_cells.tenant_id
        and tm.user_id   = auth.uid()
    )
  );

-- Service-role bypasses RLS — upserts come via the Edge Function only.
-- No INSERT/UPDATE policy for authenticated means even tenant admins cannot
-- manually write cells (prevents gaming the forecasts).

comment on table public.demand_forecast_cells is
  'Hourly order volume forecasts per tenant (7 days × 24 hours). Refreshed daily at 04:00 UTC by demand-forecast-daily Edge Function.';
