-- HIR F6 — Agent Cost Ledger
--
-- Per-tenant × per-agent token spend tracking. Lets the dispatcher gate
-- expensive intents against a monthly budget set on `tenants.settings.ai`
-- and lets platform-admin observe spend per tenant.
--
-- One row per Anthropic / OpenAI embedding call. `cost_cents` is derived
-- in the application layer (see `_shared/agent-cost.ts`) because the
-- pricing table changes more often than schemas.
--
-- RLS: tenant-scoped via the `tenant_users` membership table (same
-- pattern as copilot_agent_runs). Service-role bypasses for cron writes.
--
-- Re-applying is safe: `if not exists` on every CREATE.

create table if not exists public.agent_cost_ledger (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  agent_name      text not null,
  -- Foreign key to copilot_agent_runs is intentionally `on delete set null`
  -- so the ledger row survives a ledger row purge. Nullable because some
  -- callers (cron jobs without an orchestrator dispatch — e.g. growth-agent
  -- top-of-run cost) don't have a run id.
  run_id          uuid references public.copilot_agent_runs(id) on delete set null,
  model           text not null,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  -- numeric(10,4) → max 999999.9999 cents (~$9,999 per row). Fractional
  -- because a single 1k-token Haiku call is well under 1 cent.
  cost_cents      numeric(10,4) not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_agent_cost_ledger_tenant_created
  on public.agent_cost_ledger (tenant_id, created_at desc);

create index if not exists idx_agent_cost_ledger_tenant_agent_created
  on public.agent_cost_ledger (tenant_id, agent_name, created_at desc);

alter table public.agent_cost_ledger enable row level security;

-- Tenant members may read their own tenant's spend; service-role bypasses
-- RLS for inserts from Edge Functions. No INSERT/UPDATE/DELETE policy is
-- exposed to auth.uid clients — writes are server-side only.
drop policy if exists agent_cost_ledger_tenant_select on public.agent_cost_ledger;
create policy agent_cost_ledger_tenant_select
  on public.agent_cost_ledger
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- Monthly aggregate view — used by /dashboard/admin/observability/ai-spend
-- and by `checkBudget()` in the agent-cost helper.
-- ---------------------------------------------------------------------------

create or replace view public.v_tenant_monthly_ai_spend as
select
  tenant_id,
  agent_name,
  date_trunc('month', created_at) as month,
  sum(input_tokens)::bigint       as input_tokens,
  sum(output_tokens)::bigint      as output_tokens,
  sum(cost_cents)::numeric(14,4)  as cost_cents,
  count(*)::bigint                as call_count
from public.agent_cost_ledger
group by tenant_id, agent_name, date_trunc('month', created_at);

comment on view public.v_tenant_monthly_ai_spend is
  'F6 cost ledger — per-tenant × per-agent × per-month AI spend rollup.';
