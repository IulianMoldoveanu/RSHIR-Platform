-- HIR AI Tenant Orchestrator — Trust calibration table
--
-- Foundation for the 8-sub-agent orchestrator (see AI_TENANT_ORCHESTRATOR_VISION.md).
-- Stores per-tenant × per-agent × per-action-category trust level so the
-- orchestrator can decide whether to PROPOSE_ONLY, AUTO_REVERSIBLE, or
-- AUTO_FULL when an action is generated.
--
-- Convention: column is `restaurant_id` to match `copilot_*` tables in this
-- repo (see copilot_threads, copilot_agent_runs). Membership check uses
-- `tenant_members(tenant_id, user_id)` since the join table keeps that
-- name (see 20260430_003_audit_log.sql, 20260506_001_copilot_daily_brief_schema.sql).
-- Idempotent — safe to re-apply.

create table if not exists public.agent_trust_calibration (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.tenants(id) on delete cascade,
  agent_name text not null,
  -- Free-form action category, e.g. 'description.update', 'photo.upload',
  -- 'price.change', 'item.delete', 'menu.bulk_import'. The orchestrator
  -- writes whichever string it uses internally.
  action_category text not null,
  trust_level text not null default 'PROPOSE_ONLY'
    check (trust_level in ('PROPOSE_ONLY', 'AUTO_REVERSIBLE', 'AUTO_FULL')),
  -- When true, UI caps trust_level at PROPOSE_ONLY by policy. Owner cannot
  -- escalate destructive actions even if they wanted to.
  is_destructive boolean not null default false,
  -- Used by Sprint 13 self-improvement loop. Cheap counters; finer-grained
  -- history lives in copilot_agent_runs.
  approval_count integer not null default 0,
  rejection_count integer not null default 0,
  last_recalibrated_at timestamptz default now(),
  created_at timestamptz not null default now(),
  unique (restaurant_id, agent_name, action_category)
);

create index if not exists idx_agent_trust_calibration_restaurant
  on public.agent_trust_calibration (restaurant_id);

alter table public.agent_trust_calibration enable row level security;

drop policy if exists agent_trust_calibration_tenant_member_read on public.agent_trust_calibration;
create policy agent_trust_calibration_tenant_member_read
  on public.agent_trust_calibration
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = agent_trust_calibration.restaurant_id
         and tm.user_id   = auth.uid()
    )
  );

drop policy if exists agent_trust_calibration_tenant_member_write on public.agent_trust_calibration;
create policy agent_trust_calibration_tenant_member_write
  on public.agent_trust_calibration
  for all
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = agent_trust_calibration.restaurant_id
         and tm.user_id   = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = agent_trust_calibration.restaurant_id
         and tm.user_id   = auth.uid()
    )
  );
