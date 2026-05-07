-- HIR Menu Agent — Sprint 12 staging table
--
-- Sprint 12 introduces the FIRST sub-agent on top of the Master Orchestrator
-- skeleton merged in PR #341 (commit 5aa1d7f). Menu Agent emits structured
-- "suggestions" the OWNER reviews under a new "Sugestii Hepy" tab on
-- /dashboard/menu. Sprint 12 is intentionally read-only at the
-- restaurant_menu_items layer — proposals stay in DRAFT and Accept simply
-- records the OWNER's decision; the actual menu mutation is still done by
-- hand on the Menu page using the proposal as a guide. Per the lane brief
-- ("DO NOT auto-publish menu items in this lane — keep proposals in DRAFT
-- only").
--
-- Two tables:
--  1. `menu_agent_proposals` — durable record of an AI-generated suggestion.
--     One row per /menu_propune | /menu_oprime | /menu_promo invocation.
--     Linked to the orchestrator ledger row (`copilot_agent_runs.id`) so the
--     Sprint-13 revert UI can drill into the rich payload.
--  2. `menu_agent_invocations` — daily-cap tracking. Brief: 5/tenant/day.
--     Indexed on (tenant_id, created_at::date) for the cap query.
--
-- Idempotent: every CREATE uses `if not exists`.

-- ---------------------------------------------------------------------------
-- 1. menu_agent_proposals — DRAFT-only staging for OWNER review
-- ---------------------------------------------------------------------------

create table if not exists public.menu_agent_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Optional FK to the orchestrator ledger row. Nullable so we can write a
  -- proposal even if the dispatcher writes the ledger after we return (the
  -- writeLedger() call in master-orchestrator.ts logs and returns null on
  -- failure, never throws — we don't want to block the OWNER's UX on a
  -- ledger insert glitch).
  agent_run_id uuid references public.copilot_agent_runs(id) on delete set null,
  -- Which Menu Agent intent emitted this proposal.
  kind text not null check (kind in ('new_item', 'sold_out', 'promo')),
  -- Lifecycle state. DRAFT is the only state Menu Agent itself writes.
  -- ACCEPTED / DISMISSED are set by the OWNER via the admin UI. Sprint 12
  -- explicitly does NOT auto-mutate restaurant_menu_items on Accept — the
  -- OWNER applies the suggestion by hand.
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'ACCEPTED', 'DISMISSED')),
  -- The structured suggestion payload. Shape varies by `kind`:
  --   new_item: { name, description, price_ron, category_hint, tags? }
  --   sold_out: { item_id, until_iso, reason? }
  --   promo:    { item_id, discount_pct, headline, body, valid_from, valid_to }
  -- Schema enforcement is in the application layer (Zod) per repo convention.
  payload jsonb not null,
  -- Free-form RO rationale from Anthropic explaining why this suggestion was
  -- generated (shown verbatim to the OWNER under "De ce?" disclosure).
  rationale text,
  -- Anthropic invocation metrics — surfaced in the admin observability tile
  -- at /dashboard/admin/observability/function-runs and used by the daily
  -- cost tracker.
  model text,
  input_tokens integer,
  output_tokens integer,
  -- OWNER decision audit.
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  decision_note text,
  created_at timestamptz not null default now(),
  -- Channel that originated the request (telegram | web). Helps the UI show
  -- "primit din Telegram acum 2h" provenance. Kept loose (not enum) so
  -- Sprint 14 voice channel doesn't need a migration.
  channel text not null default 'telegram'
);

create index if not exists idx_menu_agent_proposals_tenant_status
  on public.menu_agent_proposals (tenant_id, status, created_at desc);

create index if not exists idx_menu_agent_proposals_run
  on public.menu_agent_proposals (agent_run_id)
  where agent_run_id is not null;

alter table public.menu_agent_proposals enable row level security;

-- Tenant members read their own proposals.
drop policy if exists menu_agent_proposals_member_read on public.menu_agent_proposals;
create policy menu_agent_proposals_member_read
  on public.menu_agent_proposals
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = menu_agent_proposals.tenant_id
         and tm.user_id   = auth.uid()
    )
  );

-- Writes go via service-role (Edge Functions for Telegram channel; Next.js
-- server actions for web channel). No authenticated write policy — server
-- actions re-verify OWNER role before upserting status changes.

-- ---------------------------------------------------------------------------
-- 2. menu_agent_invocations — daily-cap tracking
-- ---------------------------------------------------------------------------
--
-- Brief: max 5 invocations per tenant per day. Cheaper to query than
-- menu_agent_proposals (which carries the full payload) and lets us count
-- rejected/aborted attempts too (e.g. when Anthropic returns an error and
-- we skip the proposal insert — the invocation still counts toward the cap
-- to prevent runaway retries from exhausting Anthropic credit).

create table if not exists public.menu_agent_invocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  intent text not null,
  -- 'ok' when a proposal row was inserted; 'failed' when Anthropic threw
  -- (still counts toward cap); 'capped' when the cap blocked the call
  -- before reaching Anthropic.
  outcome text not null check (outcome in ('ok', 'failed', 'capped')),
  -- Anthropic cost accounting (USD cents × 1000 to keep integers, e.g.
  -- 0.075 USD = 75). Null when outcome != 'ok'.
  cost_micro_usd integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_menu_agent_invocations_tenant_day
  on public.menu_agent_invocations (tenant_id, created_at desc);

alter table public.menu_agent_invocations enable row level security;

-- Read access for OWNERs only — counts are mildly sensitive (cost accounting).
drop policy if exists menu_agent_invocations_owner_read on public.menu_agent_invocations;
create policy menu_agent_invocations_owner_read
  on public.menu_agent_invocations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = menu_agent_invocations.tenant_id
         and tm.user_id   = auth.uid()
         and tm.role      = 'OWNER'
    )
  );
