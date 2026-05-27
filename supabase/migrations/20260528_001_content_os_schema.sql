-- Content OS schema — AI marketing operating system foundation
--
-- Per plan locked 2026-05-28 with Iulian:
--   - Dual mode: HIR_INTERNAL (self-marketing) + TENANT_SAAS (per-tenant)
--   - WhatsApp primary control plane, Telegram fallback
--   - Multi-provider video (Runway/Pika/Veo/HeyGen) and publisher (Meta/TikTok/LinkedIn/X)
--   - 3 tiers: basic / pro / enterprise
--   - 50+ pre-baked templates (seeded in a follow-up data migration)
--
-- All tables are additive and idempotent. Existing `marketing_drafts`
-- (20260608_003) is kept for legacy read-only audit. New tables use
-- `content_*` prefix so the modul is movable to other repos cleanly.

-- ── 1. BrandContext — dual mode HIR_INTERNAL vs TENANT_SAAS ─────────────
-- The orchestrator branches on `kind` to apply different defaults:
--   HIR_INTERNAL → uses HIR-owned API credentials + paginile oficiale HIR
--   TENANT_SAAS  → uses tenant-supplied credentials + paginile tenantului
create table if not exists public.content_brand_contexts (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        references public.tenants(id) on delete cascade,
  brand_code           text        not null,
  kind                 text        not null check (kind in ('HIR_INTERNAL', 'TENANT_SAAS')),
  business_type        text        check (business_type in
    ('pizza', 'burger', 'kebab', 'sushi', 'cafe', 'pharmacy', 'general', 'other')),
  display_name         text        not null,
  tier                 text        not null default 'basic'
    check (tier in ('basic', 'pro', 'enterprise')),
  voice_json           jsonb       not null default '{}'::jsonb,
  visual_json          jsonb       not null default '{}'::jsonb,
  legal_json           jsonb,
  competitors          text[]      not null default array[]::text[],
  is_active            boolean     not null default true,
  monthly_budget_cents int         not null default 5000,
  preferred_messaging  text        not null default 'whatsapp'
    check (preferred_messaging in ('whatsapp', 'telegram')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint content_brand_contexts_tenant_brand_unique
    unique (tenant_id, brand_code)
);

create index if not exists idx_content_brand_contexts_tenant_active
  on public.content_brand_contexts (tenant_id, is_active);
create index if not exists idx_content_brand_contexts_kind
  on public.content_brand_contexts (kind);

comment on table public.content_brand_contexts is
  'Brand identity + tier + voice + visual rules. Same agents read this to stay brand-agnostic. kind=HIR_INTERNAL for Iulian, TENANT_SAAS for paying patroni.';
comment on column public.content_brand_contexts.voice_json is
  'Shape: { tone: "amical"|"profesional"|"tinerit", forbiddenTerms: string[], personas: string[], doNots: string[] }';
comment on column public.content_brand_contexts.preferred_messaging is
  'Default control plane (whatsapp recommended; telegram for tier=basic or cost-sensitive).';


-- ── 2. Messaging channels — per brand, WhatsApp OR Telegram OR both ─────
create table if not exists public.content_messaging_channels (
  id              uuid        primary key default gen_random_uuid(),
  brand_id        uuid        not null references public.content_brand_contexts(id) on delete cascade,
  channel_kind    text        not null check (channel_kind in ('whatsapp', 'telegram')),
  external_id     text        not null,
  credentials     jsonb       not null,
  webhook_secret  text        not null,
  is_active       boolean     not null default true,
  connected_at    timestamptz not null default now(),
  last_message_at timestamptz,

  constraint content_messaging_channels_brand_kind_unique
    unique (brand_id, channel_kind)
);

create index if not exists idx_content_messaging_channels_active
  on public.content_messaging_channels (channel_kind, is_active);

comment on table public.content_messaging_channels is
  'Per-brand messaging channel binding. credentials stored encrypted (Supabase vault wrapping recommended).';


-- ── 3. Templates pre-baked (seeded separately) ──────────────────────────
create table if not exists public.content_templates (
  id            uuid        primary key default gen_random_uuid(),
  business_type text        not null,
  persona       text        not null,
  goal          text        not null,
  pillar        text        not null,
  format        text        not null,
  body_template jsonb       not null,
  performance   jsonb       not null default '{}'::jsonb,
  is_active     boolean     not null default true,
  created_by    text        not null default 'seed',
  created_at    timestamptz not null default now()
);

create index if not exists idx_content_templates_lookup
  on public.content_templates (business_type, persona, goal, pillar, format)
  where is_active = true;
create index if not exists idx_content_templates_performance
  on public.content_templates using gin (performance);

comment on table public.content_templates is
  'Pre-baked content scaffolds — TemplatePickerAgent matches (business_type, persona, goal, pillar, format) → row → CopywriterAgent fills placeholders. Saves ~10x LLM cost per brief.';
comment on column public.content_templates.body_template is
  'Shape: { hook_template, body_template, cta_template, hashtags[], visual_brief }. Placeholders use {businessName}, {itemName}, {price}, etc.';


-- ── 4. Briefs — input pentru pipeline ───────────────────────────────────
create table if not exists public.content_briefs (
  id          uuid        primary key default gen_random_uuid(),
  brand_id    uuid        not null references public.content_brand_contexts(id) on delete cascade,
  pillar      text        not null,
  persona     text,
  goal        text        not null,
  source      text        not null check (source in
    ('whatsapp', 'telegram', 'cron_daily', 'manual', 'reflection_calibrate')),
  source_ref  text,
  template_id uuid        references public.content_templates(id) on delete set null,
  metadata    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_content_briefs_brand_created
  on public.content_briefs (brand_id, created_at desc);


-- ── 5. Drafts — outputuri per agent ─────────────────────────────────────
create table if not exists public.content_drafts (
  id          uuid        primary key default gen_random_uuid(),
  brief_id    uuid        not null references public.content_briefs(id) on delete cascade,
  agent_kind  text        not null,
  format      text        not null,
  body_json   jsonb       not null,
  language    text        not null default 'ro',
  variant_of  uuid        references public.content_drafts(id) on delete set null,
  status      text        not null default 'draft' check (status in
    ('draft', 'approved', 'queued', 'rejected', 'superseded', 'published')),
  reviewed_by uuid        references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  cost_cents  int         not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_content_drafts_brief_status
  on public.content_drafts (brief_id, status);
create index if not exists idx_content_drafts_status_created
  on public.content_drafts (status, created_at desc);

comment on table public.content_drafts is
  'Per-agent output rows. A single brief produces N drafts (one per format/agent_kind). status state machine: draft → approved → queued → published (or rejected/superseded).';


-- ── 6. Publications — what actually went live ───────────────────────────
create table if not exists public.content_publications (
  id              uuid        primary key default gen_random_uuid(),
  draft_id        uuid        not null references public.content_drafts(id) on delete restrict,
  channel         text        not null check (channel in
    ('tiktok', 'instagram', 'facebook', 'linkedin', 'x')),
  channel_account text        not null,
  external_id     text,
  scheduled_for   timestamptz not null,
  published_at    timestamptz,
  status          text        not null default 'queued' check (status in
    ('queued', 'publishing', 'published', 'failed', 'rolled_back')),
  error_message   text,
  trust_level     text        not null default 'PROPOSE_ONLY' check (trust_level in
    ('PROPOSE_ONLY', 'AUTO_REVERSIBLE', 'AUTO_FULL')),
  created_at      timestamptz not null default now()
);

create index if not exists idx_content_publications_schedule
  on public.content_publications (scheduled_for, status)
  where status in ('queued', 'publishing');
create index if not exists idx_content_publications_draft
  on public.content_publications (draft_id);


-- ── 7. Metrics — pulled by ReflectionAgent ──────────────────────────────
create table if not exists public.content_metrics (
  id             uuid        primary key default gen_random_uuid(),
  publication_id uuid        not null references public.content_publications(id) on delete cascade,
  collected_at   timestamptz not null default now(),
  impressions    int         not null default 0,
  reach          int         not null default 0,
  engagements    int         not null default 0,
  clicks         int         not null default 0,
  conversions    int         not null default 0,
  cost_cents     int         not null default 0,
  raw_json       jsonb
);

create index if not exists idx_content_metrics_publication
  on public.content_metrics (publication_id, collected_at desc);


-- ── 8. Agent prompt versions — Reflection calibrates ────────────────────
create table if not exists public.content_agent_prompts (
  id          uuid        primary key default gen_random_uuid(),
  agent_kind  text        not null,
  brand_code  text        not null,
  persona     text,
  version     int         not null,
  prompt_text text        not null,
  performance jsonb,
  is_active   boolean     not null default false,
  created_by  text        not null,
  created_at  timestamptz not null default now(),

  constraint content_agent_prompts_unique_version
    unique (agent_kind, brand_code, persona, version)
);

create index if not exists idx_content_agent_prompts_lookup
  on public.content_agent_prompts (agent_kind, brand_code, is_active)
  where is_active = true;


-- ── 9. Provider credentials — publishers + video gen ────────────────────
create table if not exists public.content_provider_credentials (
  id            uuid        primary key default gen_random_uuid(),
  brand_id      uuid        not null references public.content_brand_contexts(id) on delete cascade,
  provider_kind text        not null check (provider_kind in
    ('meta', 'tiktok', 'linkedin', 'x', 'runway', 'pika', 'veo', 'heygen')),
  credentials   jsonb       not null,
  expires_at    timestamptz,
  is_active     boolean     not null default true,
  connected_at  timestamptz not null default now(),

  constraint content_provider_credentials_brand_kind_unique
    unique (brand_id, provider_kind)
);

create index if not exists idx_content_provider_credentials_active
  on public.content_provider_credentials (brand_id, is_active);
create index if not exists idx_content_provider_credentials_expiry
  on public.content_provider_credentials (expires_at)
  where expires_at is not null;

comment on table public.content_provider_credentials is
  'OAuth tokens + API keys per (brand, provider). credentials stored as JSONB but must be encrypted at application layer (use supabase vault). expires_at drives daily refresh cron.';


-- ── 10. RLS — tenant_members + service_role pattern ─────────────────────
alter table public.content_brand_contexts         enable row level security;
alter table public.content_messaging_channels     enable row level security;
alter table public.content_templates              enable row level security;
alter table public.content_briefs                 enable row level security;
alter table public.content_drafts                 enable row level security;
alter table public.content_publications           enable row level security;
alter table public.content_metrics                enable row level security;
alter table public.content_agent_prompts          enable row level security;
alter table public.content_provider_credentials   enable row level security;

-- content_brand_contexts: tenant members see own brands; service_role manages all
drop policy if exists "content_brand_contexts_member_select" on public.content_brand_contexts;
create policy "content_brand_contexts_member_select"
  on public.content_brand_contexts for select
  to authenticated
  using (
    tenant_id is null  -- HIR_INTERNAL brands visible only via service_role; row tenant_id null means HIR-owned
      and false        -- explicit deny here; HIR brands shown via dedicated platform admin route
    or tenant_id in (
      select tenant_id from public.tenant_members where user_id = auth.uid()
    )
  );

drop policy if exists "content_brand_contexts_service_role_all" on public.content_brand_contexts;
create policy "content_brand_contexts_service_role_all"
  on public.content_brand_contexts for all
  to service_role
  using (true)
  with check (true);

-- content_messaging_channels: SERVICE_ROLE ONLY.
-- Codex P1 absorb: the row carries `credentials` (WA/TG bot tokens) and
-- `webhook_secret` — a STAFF/FLEET_MANAGER tenant member must NEVER be
-- able to SELECT these via the direct Supabase client. UI surfaces
-- non-secret metadata through a dedicated RPC/view in a follow-up.
drop policy if exists "content_messaging_channels_member_select" on public.content_messaging_channels;

drop policy if exists "content_messaging_channels_service_role_all" on public.content_messaging_channels;
create policy "content_messaging_channels_service_role_all"
  on public.content_messaging_channels for all
  to service_role
  using (true)
  with check (true);

-- content_templates: read by all authenticated (these are global library);
-- writes via service_role only (seed + Reflection promotion)
drop policy if exists "content_templates_authenticated_select" on public.content_templates;
create policy "content_templates_authenticated_select"
  on public.content_templates for select
  to authenticated
  using (is_active = true);

drop policy if exists "content_templates_service_role_all" on public.content_templates;
create policy "content_templates_service_role_all"
  on public.content_templates for all
  to service_role
  using (true)
  with check (true);

-- content_briefs: tenant members read own; service_role manages all
drop policy if exists "content_briefs_member_select" on public.content_briefs;
create policy "content_briefs_member_select"
  on public.content_briefs for select
  to authenticated
  using (
    brand_id in (
      select id from public.content_brand_contexts
       where tenant_id in (
         select tenant_id from public.tenant_members where user_id = auth.uid()
       )
    )
  );

drop policy if exists "content_briefs_service_role_all" on public.content_briefs;
create policy "content_briefs_service_role_all"
  on public.content_briefs for all
  to service_role
  using (true)
  with check (true);

-- content_drafts: tenant members read/approve own brand drafts; service_role writes
drop policy if exists "content_drafts_member_select" on public.content_drafts;
create policy "content_drafts_member_select"
  on public.content_drafts for select
  to authenticated
  using (
    brief_id in (
      select b.id from public.content_briefs b
        join public.content_brand_contexts bc on bc.id = b.brand_id
       where bc.tenant_id in (
         select tenant_id from public.tenant_members where user_id = auth.uid()
       )
    )
  );

-- Members can approve/reject their own drafts (status field only — body_json frozen)
drop policy if exists "content_drafts_member_status_update" on public.content_drafts;
create policy "content_drafts_member_status_update"
  on public.content_drafts for update
  to authenticated
  using (
    brief_id in (
      select b.id from public.content_briefs b
        join public.content_brand_contexts bc on bc.id = b.brand_id
       where bc.tenant_id in (
         select tenant_id from public.tenant_members where user_id = auth.uid()
       )
    )
  )
  with check (status in ('approved', 'rejected'));

-- Codex P1 absorb: RLS WITH CHECK only validates the NEW row's status.
-- A crafted UPDATE could still mutate body_json / brief_id / cost_cents
-- while setting status='approved'. Enforce column immutability via trigger
-- so member-level UPDATEs can only touch (status, reviewed_by, reviewed_at).
create or replace function public.guard_content_drafts_member_update()
returns trigger
language plpgsql
as $$
begin
  -- Service role bypasses RLS, so this trigger is the only enforcement
  -- point. We still allow service_role updates (sets session role).
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;

  if new.brief_id     is distinct from old.brief_id     then raise exception 'content_drafts.brief_id is immutable'; end if;
  if new.agent_kind   is distinct from old.agent_kind   then raise exception 'content_drafts.agent_kind is immutable'; end if;
  if new.format       is distinct from old.format       then raise exception 'content_drafts.format is immutable'; end if;
  if new.body_json    is distinct from old.body_json    then raise exception 'content_drafts.body_json is immutable post-creation'; end if;
  if new.language     is distinct from old.language     then raise exception 'content_drafts.language is immutable'; end if;
  if new.variant_of   is distinct from old.variant_of   then raise exception 'content_drafts.variant_of is immutable'; end if;
  if new.cost_cents   is distinct from old.cost_cents   then raise exception 'content_drafts.cost_cents is immutable'; end if;
  if new.created_at   is distinct from old.created_at   then raise exception 'content_drafts.created_at is immutable'; end if;

  -- reviewed_by must be set to the acting user; reviewed_at auto-stamped.
  new.reviewed_by := auth.uid();
  new.reviewed_at := coalesce(new.reviewed_at, now());
  return new;
end;
$$;

drop trigger if exists trg_guard_content_drafts_member_update on public.content_drafts;
create trigger trg_guard_content_drafts_member_update
  before update on public.content_drafts
  for each row
  execute function public.guard_content_drafts_member_update();

drop policy if exists "content_drafts_service_role_all" on public.content_drafts;
create policy "content_drafts_service_role_all"
  on public.content_drafts for all
  to service_role
  using (true)
  with check (true);

-- content_publications: tenant members read own; service_role writes
drop policy if exists "content_publications_member_select" on public.content_publications;
create policy "content_publications_member_select"
  on public.content_publications for select
  to authenticated
  using (
    draft_id in (
      select d.id from public.content_drafts d
        join public.content_briefs b on b.id = d.brief_id
        join public.content_brand_contexts bc on bc.id = b.brand_id
       where bc.tenant_id in (
         select tenant_id from public.tenant_members where user_id = auth.uid()
       )
    )
  );

drop policy if exists "content_publications_service_role_all" on public.content_publications;
create policy "content_publications_service_role_all"
  on public.content_publications for all
  to service_role
  using (true)
  with check (true);

-- content_metrics: same scoping as publications
drop policy if exists "content_metrics_member_select" on public.content_metrics;
create policy "content_metrics_member_select"
  on public.content_metrics for select
  to authenticated
  using (
    publication_id in (
      select p.id from public.content_publications p
        join public.content_drafts d on d.id = p.draft_id
        join public.content_briefs b on b.id = d.brief_id
        join public.content_brand_contexts bc on bc.id = b.brand_id
       where bc.tenant_id in (
         select tenant_id from public.tenant_members where user_id = auth.uid()
       )
    )
  );

drop policy if exists "content_metrics_service_role_all" on public.content_metrics;
create policy "content_metrics_service_role_all"
  on public.content_metrics for all
  to service_role
  using (true)
  with check (true);

-- content_agent_prompts: read by authenticated (debugging value); writes service_role
drop policy if exists "content_agent_prompts_authenticated_select" on public.content_agent_prompts;
create policy "content_agent_prompts_authenticated_select"
  on public.content_agent_prompts for select
  to authenticated
  using (true);

drop policy if exists "content_agent_prompts_service_role_all" on public.content_agent_prompts;
create policy "content_agent_prompts_service_role_all"
  on public.content_agent_prompts for all
  to service_role
  using (true)
  with check (true);

-- content_provider_credentials: NEVER expose to authenticated; service_role only
-- (rationale: contains OAuth tokens — a leak via SELECT would let any tenant
-- member impersonate the brand on FB/IG/TikTok). Tenant UI shows only metadata
-- via a view or RPC, not the raw row.
drop policy if exists "content_provider_credentials_service_role_all" on public.content_provider_credentials;
create policy "content_provider_credentials_service_role_all"
  on public.content_provider_credentials for all
  to service_role
  using (true)
  with check (true);


-- ── 11. updated_at trigger on content_brand_contexts ────────────────────
create or replace function public.touch_content_brand_contexts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_content_brand_contexts on public.content_brand_contexts;
create trigger trg_touch_content_brand_contexts
  before update on public.content_brand_contexts
  for each row
  execute function public.touch_content_brand_contexts_updated_at();
