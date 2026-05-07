-- HIR Marketing Agent V1 — drafts storage (Sprint 14)
--
-- The Marketing Agent registered with the Master Orchestrator (PR #341)
-- emits Romanian, formal social-post drafts when an OWNER (or a future
-- cron) invokes intent `marketing.draft_post`. V1 is DRAFT-ONLY: nothing
-- is auto-published regardless of trust level. Sprint 16+ may wire
-- `marketing.publish_post` to a real channel API; this migration sets up
-- the persistence those drafts land in.
--
-- The agent's ledger row in `copilot_agent_runs` references the draft via
-- the run's `payload.draft_id`. Drafts are owned per tenant; OWNER+MANAGER
-- can read, only OWNER can flip status. Writes go through service-role
-- (the dispatcher), not authenticated clients.
--
-- Idempotent: `if not exists` everywhere. Re-applying is safe.

create table if not exists public.marketing_drafts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.tenants(id) on delete cascade,

  -- Where the OWNER intends to post. V1 only generates copy; the publish
  -- step is manual (copy → paste). Free-form text so we can add channels
  -- (TikTok, GMB) without a migration.
  platform text not null default 'facebook'
    check (platform in ('facebook','instagram','google_business','tiktok','generic')),

  -- 'promo' = limited-time offer; 'announcement' = new item / hours;
  -- 'engagement' = community / story; matches the OpenAI/marketing-101
  -- post-type taxonomy GMB recommends.
  post_type text not null default 'promo'
    check (post_type in ('promo','announcement','engagement')),

  -- The actual copy. Both fields are RO formal; admin UI shows them
  -- side-by-side. `headline_ro` may be null when the platform doesn't
  -- support a headline (Instagram caption, TikTok).
  headline_ro text,
  body_ro text not null,
  -- Suggested 3-5 hashtags joined by spaces, e.g. '#brașov #pizza ...'.
  hashtags text,
  -- Free-form CTA suggestion ('Comandați acum la ...').
  cta_ro text,

  -- Lifecycle. 'draft' is the only state V1 ever writes. 'approved' /
  -- 'discarded' are reserved for the future approve UI. 'published' is
  -- reserved for Sprint 16+ when we wire a real publish channel.
  status text not null default 'draft'
    check (status in ('draft','approved','discarded','published')),

  -- Free-form jsonb capturing the signals the agent used to draft this
  -- (recent top items, weather code, cuisine, weekday). Lets the OWNER
  -- understand WHY the agent suggested this copy. Not user-facing in V1.
  source_signals jsonb,

  -- LLM accounting — mirrors growth_recommendations columns so we can
  -- aggregate AI cost by tenant in one place later.
  model text,
  cost_usd numeric(10,6),
  -- The dispatcher run that produced this draft. Lets the AI Activity
  -- ledger join back to the artifact.
  source_run_id uuid references public.copilot_agent_runs(id) on delete set null,

  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  discarded_at timestamptz,
  discarded_by uuid references auth.users(id)
);

create index if not exists idx_marketing_drafts_tenant_created
  on public.marketing_drafts (restaurant_id, created_at desc);

create index if not exists idx_marketing_drafts_status
  on public.marketing_drafts (restaurant_id, status, created_at desc);

alter table public.marketing_drafts enable row level security;

-- Read: any tenant member. Writes happen via service-role from the
-- Marketing Agent dispatcher (no authenticated write policy by design).
drop policy if exists marketing_drafts_member_read on public.marketing_drafts;
create policy marketing_drafts_member_read
  on public.marketing_drafts
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = marketing_drafts.restaurant_id
         and tm.user_id   = auth.uid()
    )
  );
