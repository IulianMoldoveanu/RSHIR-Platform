-- Lane STATUS-INCIDENTS-ADMIN (2026-05-08).
--
-- Builds on top of the already-shipped public status page (Lane STATUS,
-- migration 20260605_004_status_page.sql) by adding the operator surface
-- Iulian needs to declare and resolve incidents from the admin dashboard,
-- plus retention + a per-incident transition log so the public page can
-- show a small timeline ("Investigare 14:02 → Cauză identificată 14:18 →
-- Rezolvat 14:41") instead of just the final state.
--
-- Additive only — no breaking changes to public_incidents (which is read
-- by /status today). Cold-start safe; idempotent re-apply.
--
-- Touches:
--   1. ALTER public.public_incidents: add resolved_by + updated_at
--   2. CREATE public.public_incident_status_log: append-only transition log
--   3. CRON: retention prune for health_check_pings (90 days, daily 03:30 UTC)
--
-- Subscribers + email fanout are intentionally deferred to a follow-up PR.
-- Without an admin UI to declare incidents (this PR), notifications have
-- nothing to fire on. See STRATEGY.md for the sequencing rationale.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. public_incidents — operator metadata extensions
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.public_incidents
  add column if not exists resolved_by uuid references auth.users(id) on delete set null;

alter table public.public_incidents
  add column if not exists updated_at timestamptz not null default now();

-- Bump updated_at automatically on any row mutation. Keeps the admin UI
-- "Last updated" column honest without per-action plumbing.
create or replace function public.public_incidents_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists public_incidents_set_updated_at on public.public_incidents;
create trigger public_incidents_set_updated_at
  before update on public.public_incidents
  for each row
  execute function public.public_incidents_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. public_incident_status_log — append-only transition history
-- ─────────────────────────────────────────────────────────────────────────────
-- One row per status change so the public page can render a per-incident
-- timeline. Read-only for anon (status changes are already public-by-design
-- via public_incidents.status); writes are service-role only.

create table if not exists public.public_incident_status_log (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.public_incidents(id) on delete cascade,
  status text not null
    check (status in ('investigating', 'identified', 'monitoring', 'resolved')),
  note text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists public_incident_status_log_incident_idx
  on public.public_incident_status_log (incident_id, changed_at asc);

alter table public.public_incident_status_log enable row level security;

drop policy if exists "anon_select_public_incident_status_log" on public.public_incident_status_log;
create policy "anon_select_public_incident_status_log"
  on public.public_incident_status_log
  for select
  to anon, authenticated
  using (true);

drop policy if exists "service_role_write_public_incident_status_log" on public.public_incident_status_log;
create policy "service_role_write_public_incident_status_log"
  on public.public_incident_status_log
  for all
  to service_role
  using (true)
  with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Retention — prune health_check_pings older than 90 days, daily 03:30 UTC
-- ─────────────────────────────────────────────────────────────────────────────
-- The status page only renders 90 days of uptime bars, and the table grows
-- by ~864 rows/day (3 apps × 12 probes/hour × 24h). At 90 days we sit at
-- ~78k rows — not pressing, but unbounded growth is a smell. Daily prune
-- keeps the table bounded indefinitely with negligible delete cost.

create extension if not exists pg_cron;

do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'health-check-pings-retention';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'health-check-pings-retention',
  '30 3 * * *',
  $$
    delete from public.health_check_pings
    where checked_at < now() - interval '90 days';
  $$
);
