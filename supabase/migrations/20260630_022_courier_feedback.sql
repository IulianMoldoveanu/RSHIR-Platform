-- Migration: courier feedback (suggestions + bug reports)
--
-- Point 3 of the HIR Curier ops roadmap: give couriers a way to submit
-- improvement SUGGESTIONS and BUG reports from inside the app. Fleet managers
-- (who own the support relationship) and platform admins triage them.

create table if not exists public.courier_feedback (
  id              uuid primary key default gen_random_uuid(),
  courier_user_id uuid not null references auth.users(id) on delete cascade,
  -- Denormalised courier's fleet at submit time so a fleet manager can filter
  -- to their own riders without an extra join (and it survives a later transfer).
  fleet_id        uuid references public.courier_fleets(id) on delete set null,
  kind            text not null check (kind in ('SUGGESTION', 'BUG')),
  message         text not null,
  app_version     text,
  platform        text,
  status          text not null default 'NEW'
                    check (status in ('NEW', 'TRIAGED', 'RESOLVED', 'DISMISSED')),
  resolved_by     uuid references auth.users(id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_courier_feedback_status
  on public.courier_feedback (status, created_at desc);
create index if not exists idx_courier_feedback_fleet
  on public.courier_feedback (fleet_id, created_at desc);
create index if not exists idx_courier_feedback_courier
  on public.courier_feedback (courier_user_id, created_at desc);

alter table public.courier_feedback enable row level security;

-- A courier may submit and read back their own feedback.
drop policy if exists "courier_feedback_own_insert" on public.courier_feedback;
create policy "courier_feedback_own_insert"
  on public.courier_feedback for insert
  with check (courier_user_id = auth.uid());

drop policy if exists "courier_feedback_own_read" on public.courier_feedback;
create policy "courier_feedback_own_read"
  on public.courier_feedback for select
  using (courier_user_id = auth.uid());

-- A fleet manager (owner of the fleet) reads feedback from their own riders.
drop policy if exists "courier_feedback_fleet_read" on public.courier_feedback;
create policy "courier_feedback_fleet_read"
  on public.courier_feedback for select
  using (
    exists (
      select 1 from public.courier_fleets f
      where f.id = courier_feedback.fleet_id
        and f.owner_user_id = auth.uid()
    )
  );

-- Platform admins read everything.
drop policy if exists "courier_feedback_admin_read" on public.courier_feedback;
create policy "courier_feedback_admin_read"
  on public.courier_feedback for select
  using (
    exists (
      select 1 from public.platform_admins pa
      where pa.user_id = auth.uid()
    )
  );

-- Status changes (triage / resolve / dismiss) are performed by the
-- updateFeedbackStatusAction server action via the service role, which
-- authorises platform-admin OR the owning fleet manager in application code
-- and bypasses RLS — so no UPDATE policy is defined here on purpose.

comment on table public.courier_feedback is
  'Courier-submitted suggestions + bug reports. Couriers insert/read own rows; '
  'fleet managers read their fleet; platform admins read all. Status updates '
  'go through a service-role server action.';
