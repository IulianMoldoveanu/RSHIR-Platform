-- Public status page schema (Lane STATUS, 2026-05-05).
--
-- Adds two additive tables that power /status on apps/restaurant-web:
--
--   1. public.health_check_pings — append-only history of every health probe
--      from supabase/functions/health-monitor (called every 5 min by GH Action).
--      Used to compute the 90-day uptime bar chart and the "last 5 pings"
--      overall-status badge. anon can SELECT (read-only public data).
--
--   2. public.public_incidents — operator-curated incidents shown in the
--      "Recent incidents" list. anon can SELECT; INSERT/UPDATE restricted to
--      service_role (PLATFORM_ADMIN tooling writes through service-role
--      Supabase admin client; no public mutation surface).
--
-- Both tables are intentionally simple — no joins back to internal tables,
-- no tenant scoping, no fleet leakage. Status page must remain safe to
-- expose without auth.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. health_check_pings — append-only probe history
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.health_check_pings (
  id bigserial primary key,
  app text not null,
  ok boolean not null,
  status_code int,
  latency_ms int,
  checked_at timestamptz not null default now()
);

create index if not exists health_check_pings_app_checked_at_idx
  on public.health_check_pings (app, checked_at desc);

create index if not exists health_check_pings_checked_at_idx
  on public.health_check_pings (checked_at desc);

alter table public.health_check_pings enable row level security;

drop policy if exists "anon_select_health_check_pings" on public.health_check_pings;
create policy "anon_select_health_check_pings"
  on public.health_check_pings
  for select
  to anon, authenticated
  using (true);

drop policy if exists "service_role_insert_health_check_pings" on public.health_check_pings;
create policy "service_role_insert_health_check_pings"
  on public.health_check_pings
  for insert
  to service_role
  with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. public_incidents — operator-curated public incidents
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.public_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'investigating'
    check (status in ('investigating', 'identified', 'monitoring', 'resolved')),
  severity text not null default 'minor'
    check (severity in ('minor', 'major', 'critical')),
  affected_services text[] not null default array[]::text[],
  description text,
  postmortem_url text,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists public_incidents_started_at_idx
  on public.public_incidents (started_at desc);

alter table public.public_incidents enable row level security;

drop policy if exists "anon_select_public_incidents" on public.public_incidents;
create policy "anon_select_public_incidents"
  on public.public_incidents
  for select
  to anon, authenticated
  using (true);

drop policy if exists "service_role_write_public_incidents" on public.public_incidents;
create policy "service_role_write_public_incidents"
  on public.public_incidents
  for all
  to service_role
  using (true)
  with check (true);
