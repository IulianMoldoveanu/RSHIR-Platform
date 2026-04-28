-- AI CEO Daily Brief — schema additions
--
-- Adds the schedule/state table consumed by the new
-- `copilot-daily-brief` Edge Function (deployed separately). Migration
-- is fully idempotent and additive — no existing tables/data altered.
--
-- The Edge Function reads `copilot_brief_schedules` to decide which
-- tenants get a brief today. The function logs each run as a row in
-- the existing `copilot_agent_runs` table; the columns added here
-- track approval state per suggestion.

create table if not exists public.copilot_brief_schedules (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default true,
  -- Hour-of-day in Bucharest local time when the brief should fire.
  -- Stored as 0-23. Cron runs at multiple hours; function filters per
  -- tenant on this column, so different tenants can pick different times
  -- without needing N cron jobs.
  delivery_hour_local int not null default 8
    check (delivery_hour_local between 0 and 23),
  last_sent_at timestamptz,
  -- After 3 days where nobody replied to the brief, pause until the
  -- operator re-enables. Anti-spam guard.
  consecutive_skips int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_copilot_brief_schedules_enabled
  on public.copilot_brief_schedules (enabled, delivery_hour_local)
  where enabled = true;

alter table public.copilot_brief_schedules enable row level security;
drop policy if exists copilot_brief_schedules_member_read on public.copilot_brief_schedules;
create policy copilot_brief_schedules_member_read
  on public.copilot_brief_schedules for select to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = copilot_brief_schedules.tenant_id
         and tm.user_id   = auth.uid()
    )
  );
-- Writes go via service-role only (the Edge Function + admin server actions).

-- Track approval/rejection state per suggestion on each brief run.
-- Schema-added on the existing copilot_agent_runs table so we don't
-- create a parallel ledger.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'copilot_agent_runs'
       and column_name = 'suggestion_status'
  ) then
    alter table public.copilot_agent_runs
      add column suggestion_status text[] not null default array[]::text[];
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'copilot_agent_runs'
       and column_name = 'auto_executed_actions'
  ) then
    alter table public.copilot_agent_runs
      add column auto_executed_actions jsonb not null default '[]'::jsonb;
  end if;
end$$;

-- Auto-enroll every tenant that has a Telegram thread bound, so we
-- don't need a separate onboarding step. Idempotent via on conflict.
insert into public.copilot_brief_schedules (tenant_id)
  select t.restaurant_id
    from public.copilot_threads t
    on conflict (tenant_id) do nothing;
