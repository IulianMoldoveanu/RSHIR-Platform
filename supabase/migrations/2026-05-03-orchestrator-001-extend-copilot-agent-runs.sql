-- HIR AI Tenant Orchestrator — extend copilot_agent_runs for proposal/revert flow
--
-- Single ledger strategy: rather than create a parallel `agent_runs` table,
-- we extend the existing `copilot_agent_runs` (already in prod, semi-owned
-- by the bot repo) with the columns needed for universal propose →
-- approve/reject → execute → revert flow. Precedent: 20260506_001 already
-- extended this table with `auto_executed_actions` + `suggestion_status`.
--
-- All ALTERs are `add column if not exists`. Both repos can re-apply this
-- migration safely; bot repo will sync via the same additive-only rule.
-- The new `status` column defaults to 'EXECUTED' so legacy rows (pre-this-
-- migration) carry forward as historical "already happened" entries.
--
-- Idempotent. Safe to re-apply.

alter table public.copilot_agent_runs
  add column if not exists action_type text;

alter table public.copilot_agent_runs
  add column if not exists payload jsonb;

-- status uses a check constraint, but `add column if not exists` doesn't
-- accept inline checks alongside `default` reliably across pg versions.
-- We add the column without the check first, then conditionally add the
-- constraint.
alter table public.copilot_agent_runs
  add column if not exists status text default 'EXECUTED';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.copilot_agent_runs'::regclass
       and conname = 'copilot_agent_runs_status_check'
  ) then
    alter table public.copilot_agent_runs
      add constraint copilot_agent_runs_status_check
      check (status in ('PROPOSED', 'EXECUTED', 'REVERTED', 'REJECTED'));
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

alter table public.copilot_agent_runs
  add column if not exists parent_run_id uuid references public.copilot_agent_runs(id);

create index if not exists idx_copilot_agent_runs_status_v2
  on public.copilot_agent_runs (restaurant_id, status, created_at desc);

-- Speeds up the "what's revertable in the last 24h" query on the AI
-- Activity page. Partial index keeps it tiny.
create index if not exists idx_copilot_agent_runs_revert_window
  on public.copilot_agent_runs (restaurant_id, status, created_at desc)
  where status = 'EXECUTED' and reverted_at is null;

-- RLS is already enabled on copilot_agent_runs (see 20260429_001) and the
-- ledger is read via service-role from the admin app. The /dashboard/ai-
-- activity page goes through a server component that uses the service-
-- role client (createAdminClient), so no additional policy is required.
-- We do NOT add an authenticated SELECT policy here — keeping ledger
-- access service-role-only matches the existing pattern.
