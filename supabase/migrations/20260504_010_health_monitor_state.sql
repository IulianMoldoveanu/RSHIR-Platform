-- Health Monitor state table — one row per app, tracks last probe + downtime start.
-- Used by supabase/functions/health-monitor/index.ts (called every 5 min by GitHub Actions).
-- Only stores transition state — actual probe history lives in Vercel/Edge logs.

create table if not exists public.health_monitor_state (
  app text primary key,
  last_ok boolean not null,
  failed_since timestamptz,
  last_checked_at timestamptz not null default now()
);

alter table public.health_monitor_state enable row level security;

-- Service-role only. No user access.
create policy "service_role_only_health_monitor_state"
  on public.health_monitor_state
  for all
  to service_role
  using (true)
  with check (true);
