-- HIR AI Master Orchestrator — schema foundation (Sprint 12)
--
-- EXTENDS the existing AI CEO surface. Does NOT create a parallel ledger
-- ('ai_actions_log' was rejected) — we add proposal/revert columns to the
-- already-shipped `copilot_agent_runs` table. Precedent: migration
-- 20260506_001_copilot_daily_brief_schema.sql added `suggestion_status` +
-- `auto_executed_actions` to the same table; we follow that pattern.
--
-- Two additions:
--  1. Lifecycle columns on `copilot_agent_runs` so a single ledger can
--     represent PROPOSED -> EXECUTED -> REVERTED|REJECTED transitions, plus
--     a `parent_run_id` for revert chains.
--  2. New `tenant_agent_trust` table — per-tenant × per-agent ×
--     per-action-category trust level (PROPOSE_ONLY / AUTO_REVERSIBLE /
--     AUTO_FULL). Replaces the simpler `tenants.ai_trust_level` enum
--     proposal so destructive categories can be locked at PROPOSE_ONLY
--     even when the operator opts the rest of the agent into AUTO.
--
--     We deliberately use a NEW table name (not `agent_trust_calibration`)
--     because that name is already taken by the feedback-loop / fix-agent
--     trust table from migration 20260504_005_fix_supervisor.sql, which
--     has a single-row-per-agent shape (`agent_name` PK, no tenant). The
--     orchestrator's per-tenant × per-category shape is incompatible.
--     Pushed back from Codex P1 review on PR #341 (af651c0/4ab5732).
--
-- All ALTERs use `add column if not exists`; all CREATEs use
-- `if not exists`. Re-applying is safe.

-- ---------------------------------------------------------------------------
-- 1. Extend copilot_agent_runs for proposal/revert flow
-- ---------------------------------------------------------------------------

alter table public.copilot_agent_runs
  add column if not exists action_type text;

alter table public.copilot_agent_runs
  add column if not exists payload jsonb;

-- The state column drives the propose/execute/revert lifecycle. Default
-- is EXECUTED so legacy rows (pre-migration) carry forward as historical
-- "already happened" entries — never block a re-deploy.
alter table public.copilot_agent_runs
  add column if not exists state text default 'EXECUTED';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.copilot_agent_runs'::regclass
       and conname  = 'copilot_agent_runs_state_check'
  ) then
    alter table public.copilot_agent_runs
      add constraint copilot_agent_runs_state_check
      check (state in ('PROPOSED','EXECUTED','REVERTED','REJECTED'));
  end if;
end$$;

alter table public.copilot_agent_runs
  add column if not exists approved_by uuid references auth.users(id);

alter table public.copilot_agent_runs
  add column if not exists approved_at timestamptz;

alter table public.copilot_agent_runs
  add column if not exists reverted_at timestamptz;

alter table public.copilot_agent_runs
  add column if not exists reverted_by uuid references auth.users(id);

alter table public.copilot_agent_runs
  add column if not exists reverted_reason text;

-- Self-FK so a REVERT row can point back at the original EXECUTED row.
alter table public.copilot_agent_runs
  add column if not exists parent_run_id uuid references public.copilot_agent_runs(id);

-- Pre-state snapshot captured at execution so revert has something to
-- restore from. Free-form jsonb; intent owner decides shape.
alter table public.copilot_agent_runs
  add column if not exists pre_state jsonb;

create index if not exists idx_copilot_agent_runs_state
  on public.copilot_agent_runs (restaurant_id, state, created_at desc);

-- Speeds up the "what's revertable in the last 24h" query the AI Activity
-- page runs on every render. Partial index keeps it tiny.
create index if not exists idx_copilot_agent_runs_revert_window
  on public.copilot_agent_runs (restaurant_id, state, created_at desc)
  where state = 'EXECUTED' and reverted_at is null;

-- ---------------------------------------------------------------------------
-- 2. tenant_agent_trust — per-tenant × per-agent × per-category
-- ---------------------------------------------------------------------------

create table if not exists public.tenant_agent_trust (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.tenants(id) on delete cascade,
  -- Free-form agent identifier. Known values today: 'master', 'menu',
  -- 'marketing', 'ops', 'cs', 'analytics', 'finance', 'compliance',
  -- 'growth'. We do NOT enum these — sub-agents can ship without a
  -- migration.
  agent_name text not null,
  -- Free-form action category the agent registers when it runs an intent,
  -- e.g. 'description.update', 'price.change', 'promo.publish'.
  action_category text not null,
  trust_level text not null default 'PROPOSE_ONLY'
    check (trust_level in ('PROPOSE_ONLY','AUTO_REVERSIBLE','AUTO_FULL')),
  -- Policy flag. When true, the UI caps trust_level at PROPOSE_ONLY even
  -- if an OWNER tries to escalate. Backend re-validates on every dispatch.
  is_destructive boolean not null default false,
  -- Counters consumed by the future Sprint 13 self-improvement loop.
  approval_count integer not null default 0,
  rejection_count integer not null default 0,
  last_recalibrated_at timestamptz default now(),
  created_at timestamptz not null default now(),
  unique (restaurant_id, agent_name, action_category)
);

create index if not exists idx_tenant_agent_trust_restaurant
  on public.tenant_agent_trust (restaurant_id);

alter table public.tenant_agent_trust enable row level security;

drop policy if exists tenant_agent_trust_member_read on public.tenant_agent_trust;
create policy tenant_agent_trust_member_read
  on public.tenant_agent_trust
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = tenant_agent_trust.restaurant_id
         and tm.user_id   = auth.uid()
    )
  );

-- Writes go via service-role (server actions). No authenticated write
-- policy by design — the admin app calls server actions that re-verify
-- OWNER role before upserting.
