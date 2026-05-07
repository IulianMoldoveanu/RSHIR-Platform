-- HIR Customer Service Agent — response drafts (Sprint 14)
--
-- The orchestrator ledger (`copilot_agent_runs` from migration
-- 20260608_002_ai_master_orchestrator.sql) records audit-grade entries:
-- "agent X did Y at time Z, here's what changed". CS Agent's three intents
-- generate **drafts** the OWNER picks from before posting, so we need a
-- short-lived sidecar table for the option set + selection state. Once
-- the OWNER picks an option and posts, we still write the executed action
-- to the orchestrator ledger via dispatchIntent — this table is the
-- "draft pad", not the audit trail.
--
-- Why a separate table:
--   - 3 response options per row (reply review, complaint template).
--     Embedding 3 strings in `copilot_agent_runs.payload` is doable but
--     loses the (status, posted_at, selected_option) lifecycle fields.
--   - The weekly insights digest produces a **persistent** snapshot the
--     OWNER reads on /dashboard/feedback/insights for 7 days; a one-shot
--     ledger row would force re-generating on every page load.
--   - Source-id (review_id / feedback_id / digest period) is searchable
--     so the UI can show "Hepy already drafted a reply for this review".
--
-- Idempotent: every CREATE/ALTER uses IF NOT EXISTS.

create table if not exists public.cs_agent_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Free-form intent string. Known values:
  --   'review_reply'       — 3 reply options for a customer review
  --   'complaint_template' — empathetic response for a complaint type
  --   'feedback_digest'    — weekly summary of reviews + chat + ratings
  intent text not null check (intent in ('review_reply','complaint_template','feedback_digest')),
  -- Lifecycle:
  --   'DRAFT'    — Hepy generated, OWNER hasn't picked yet
  --   'SELECTED' — OWNER picked an option (selected_option set)
  --   'POSTED'   — OWNER acted on the suggestion (review reply written, etc.)
  --   'DISMISSED'— OWNER closed the suggestion without using it
  status text not null default 'DRAFT'
    check (status in ('DRAFT','SELECTED','POSTED','DISMISSED')),
  -- Free-form opaque source key. For 'review_reply' it's the review uuid;
  -- for 'complaint_template' it's the complaint type enum string; for
  -- 'feedback_digest' it's the ISO week label e.g. '2026-W19'. Text not
  -- uuid because not all sources are uuids.
  source_id text,
  -- The 3 options Hepy generated. Shape:
  --   review_reply       => [{tone:'formal'|'warm'|'direct', text:'...'}, ...]
  --   complaint_template => [{tone, text, suggested_compensation:'...'}]
  --   feedback_digest    => {top_praised:[...], top_complaints:[...],
  --                          sentiment:{trend, score}, action_items:[...]}
  response_options jsonb not null,
  -- Index of the option the OWNER picked (0..2). Null until selected.
  selected_option int,
  posted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cs_agent_responses_tenant_status_created
  on public.cs_agent_responses (tenant_id, status, created_at desc);

-- Used by the UI to find an existing draft for a specific review/complaint
-- so the "Sugestii Hepy" button can flip from "Generează" to "Vezi draft".
create index if not exists idx_cs_agent_responses_source
  on public.cs_agent_responses (tenant_id, intent, source_id)
  where source_id is not null;

-- Auto-bump updated_at on every UPDATE.
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'cs_agent_responses_touch_updated_at'
  ) then
    create function public.cs_agent_responses_touch_updated_at()
    returns trigger language plpgsql as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;
end$$;

drop trigger if exists cs_agent_responses_touch on public.cs_agent_responses;
create trigger cs_agent_responses_touch
  before update on public.cs_agent_responses
  for each row execute function public.cs_agent_responses_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: tenant members can read their own drafts. Writes go via service-role
-- (server actions re-verify membership). Same shape as restaurant_reviews +
-- tenant_agent_trust.
-- ---------------------------------------------------------------------------

alter table public.cs_agent_responses enable row level security;

drop policy if exists cs_agent_responses_member_read on public.cs_agent_responses;
create policy cs_agent_responses_member_read
  on public.cs_agent_responses
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = cs_agent_responses.tenant_id
         and tm.user_id   = auth.uid()
    )
  );

-- No authenticated insert/update/delete policy — server actions use the
-- service-role client after re-verifying tenant membership.
