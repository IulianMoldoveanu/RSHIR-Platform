-- Unmet-demand signals (fleet marketplace Phase 2).
--
-- The most valuable part of the demand map is the demand you DON'T serve: a
-- customer entered a real address into the storefront and we could not deliver
-- (outside every zone, zone paused for lack of couriers, or no pricing tier for
-- the distance). Today that intent vanishes silently. This captures it.
--
-- Each signal is a coarsened (~1km) dropoff coordinate + the reason. Over time
-- this is the heatmap that tells you WHERE to expand a zone, add a fleet, or
-- raise capacity -- and it is the densest input to the eventual aggregator.
--
-- Privacy: no PII. Coarsened to ~1km (a zone-density grid, not a home address),
-- tenant + reason only. Recorded by the storefront quote route via the
-- SECURITY DEFINER RPC below (best-effort -- never blocks the quote).

create table if not exists public.demand_signals (
  id               uuid primary key default gen_random_uuid(),
  signal_type      text not null,                  -- OUTSIDE_ZONE | ZONE_PAUSED | NO_TIER
  vertical         text not null default 'restaurant',
  source_tenant_id uuid,
  zone_id          uuid,                            -- reserved: resolve from coords later
  distance_km      numeric,
  dropoff_lat_1km  numeric,                         -- coarsened ~1km grid
  dropoff_lng_1km  numeric,
  reason           text,
  occurred_at      timestamptz not null default now(),
  payload          jsonb not null default '{}'::jsonb
);

create index if not exists idx_demand_signals_occurred on public.demand_signals (occurred_at);
create index if not exists idx_demand_signals_tenant   on public.demand_signals (source_tenant_id);
create index if not exists idx_demand_signals_type     on public.demand_signals (signal_type);

comment on table public.demand_signals is
  'Fleet marketplace Phase 2: unmet delivery demand. A customer wanted delivery '
  'to a real address but we could not serve it (OUTSIDE_ZONE / ZONE_PAUSED / '
  'NO_TIER). Coarsened (~1km) coords only -- the expansion/densification heatmap. '
  'Written by record_unmet_demand() from the storefront quote route.';

-- Recording RPC. SECURITY DEFINER so the storefront can write without the table
-- being open; coarsening happens here so callers can pass raw coords safely.
create or replace function public.record_unmet_demand(
  p_tenant_id   uuid,
  p_signal_type text,
  p_lat         numeric,
  p_lng         numeric,
  p_distance_km numeric default null,
  p_reason      text    default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_signal_type not in ('OUTSIDE_ZONE','ZONE_PAUSED','NO_TIER') then
    return;  -- ignore unknown signal types
  end if;
  insert into public.demand_signals (
    source_tenant_id, signal_type, vertical, distance_km,
    dropoff_lat_1km, dropoff_lng_1km, reason
  ) values (
    p_tenant_id, p_signal_type, 'restaurant', p_distance_km,
    round(p_lat, 2), round(p_lng, 2), nullif(btrim(coalesce(p_reason, '')), '')
  );
end;
$$;

comment on function public.record_unmet_demand(uuid, text, numeric, numeric, numeric, text) is
  'Fleet marketplace Phase 2: records an unmet-demand signal (coarsened ~1km). '
  'Called best-effort by the storefront quote route on OUTSIDE_ZONE/ZONE_PAUSED/'
  'NO_TIER. No PII.';

revoke all on function public.record_unmet_demand(uuid, text, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.record_unmet_demand(uuid, text, numeric, numeric, numeric, text) to authenticated, service_role;

-- RLS: default-deny. A tenant sees their own unmet demand (actionable for them);
-- platform reads via service_role.
alter table public.demand_signals enable row level security;

drop policy if exists demand_signals_tenant_read on public.demand_signals;
create policy demand_signals_tenant_read on public.demand_signals
  for select to authenticated
  using (public.is_tenant_member(source_tenant_id));
