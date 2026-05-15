-- HIR F6 — Self-improving loop: trust auto-promotion
--
-- Extends `tenant_agent_trust` (migration 20260608_002) with the columns
-- the daily promotion worker needs, plus a view that counts "clean" runs
-- (EXECUTED with no REVERTED child) per (tenant, agent) over the last
-- 30 days. The promotion logic lives in
-- `supabase/functions/_shared/trust-promote.ts` and is invoked daily by
-- the `trust-promote-daily` Edge Function.
--
-- Promotion rules (encoded in TypeScript, see trust-promote.ts):
--   PROPOSE_ONLY    -> AUTO_REVERSIBLE  after >=20 consecutive clean runs
--   AUTO_REVERSIBLE -> AUTO_FULL        after >=50 consecutive clean runs
-- Destructive categories never auto-promote (the dispatcher's hard guard
-- already pins them at PROPOSE_ONLY; we also short-circuit in code).
--
-- All ALTERs use `add column if not exists`. Re-applying is safe.

-- ---------------------------------------------------------------------------
-- 1. Extend tenant_agent_trust
-- ---------------------------------------------------------------------------

alter table public.tenant_agent_trust
  add column if not exists auto_promote_eligible boolean not null default true;

alter table public.tenant_agent_trust
  add column if not exists last_auto_promoted_at timestamptz;

alter table public.tenant_agent_trust
  add column if not exists consecutive_clean_runs integer not null default 0;

-- ---------------------------------------------------------------------------
-- 2. v_agent_clean_runs_30d
--    A "clean run" = an EXECUTED row in the last 30 days whose id is not
--    referenced as parent by any REVERTED child row. Aggregated per
--    (restaurant_id, agent_name).
-- ---------------------------------------------------------------------------

create or replace view public.v_agent_clean_runs_30d as
  select
    r.restaurant_id,
    r.agent_name,
    count(*) filter (
      where r.state = 'EXECUTED'
        and r.created_at >= now() - interval '30 days'
        and not exists (
          select 1 from public.copilot_agent_runs c
           where c.parent_run_id = r.id
             and c.state = 'REVERTED'
        )
    )::int as clean_runs_30d,
    count(*) filter (
      where r.state = 'REVERTED'
        and r.created_at >= now() - interval '30 days'
    )::int as reverts_30d
  from public.copilot_agent_runs r
  where r.created_at >= now() - interval '30 days'
  group by r.restaurant_id, r.agent_name;

comment on view public.v_agent_clean_runs_30d is
  'F6 trust auto-promotion: per (tenant, agent) counts of clean EXECUTED runs and REVERTED rows in the last 30 days. Consumed by the trust-promote-daily Edge Function.';
