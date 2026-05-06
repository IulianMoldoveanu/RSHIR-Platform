-- Lane AGGREGATOR-EMAIL-INTAKE — Phase 1 schema (PR 1 of 3).
--
-- Goal: let a restaurant forward their Glovo / Wolt / Bolt Food order
-- confirmation emails to a per-tenant alias `comenzi-<slug>@orders.hir.ro`.
-- HIR receives the email, stores the raw payload, runs an Anthropic-backed
-- parse, and (later) inserts a row into `restaurant_orders` with
-- `source IN ('GLOVO','WOLT','BOLT_FOOD')` so it shows up in KDS + admin
-- realtime feeds. Native-app first (90% tablet usage) — email parsing is
-- the path that doesn't require a Chrome extension or POS hardware.
--
-- This migration is the audit + alias plumbing only. PR 2 ships the
-- Edge Function receiver + parser. PR 3 ships the admin UI.
--
-- ADDITIVE only. Touches:
--   • new column tenants.feature_flags jsonb (default '{}')
--   • new table public.aggregator_intake_aliases
--   • new table public.aggregator_email_jobs
--   • new storage bucket "aggregator-emails" (private)
--
-- Default value of the feature flag = false. Owners opt in from
-- /dashboard/settings/aggregator-intake (PR 3).
--
-- The feature is internal-confidentiality safe: it never surfaces "fleet"
-- or "subcontractor" — it only exposes "Glovo / Wolt / Bolt Food" labels
-- which the restaurant is already a customer of.

-- ── 1. tenants.feature_flags column ─────────────────────────────────────
-- We already have tenants.settings jsonb, but it's heavily used by
-- onboarding + storefront for plain string flags (city, hero copy, etc.)
-- and we want a clear separation for *capability* gates that ship/unship
-- whole subsystems. New column, default '{}'::jsonb, NULL-safe lookups
-- via `coalesce(tenants.feature_flags, '{}')`.
alter table public.tenants
  add column if not exists feature_flags jsonb not null default '{}'::jsonb;

comment on column public.tenants.feature_flags is
  'Capability gates that toggle entire subsystems on/off per tenant. '
  'Distinct from settings (which holds free-form config like city, '
  'hero copy). Read with coalesce(feature_flags, ''{}''::jsonb). '
  'Examples: aggregator_email_intake_enabled (PR 1 Lane AGGREGATOR-EMAIL-INTAKE).';

-- ── 2. aggregator_intake_aliases ────────────────────────────────────────
-- One row per tenant. The alias_local part is the local-part of the email
-- address (e.g. "comenzi-foisorul-a"). The receiver matches incoming
-- emails by `to` against `<alias_local>@orders.hir.ro` to resolve the
-- tenant. `secret` is a random 32-byte hex string used as an extra
-- query-string token for the Cloudflare → Edge Function POST so a leaked
-- alias address alone can't be used to spoof; the Cloudflare Email Worker
-- appends `?token=<secret>` when forwarding.
create table if not exists public.aggregator_intake_aliases (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  alias_local text not null unique,
  secret text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.aggregator_intake_aliases is
  'Per-tenant email alias for Glovo/Wolt/Bolt Food order intake. '
  'alias_local is unique (e.g. "comenzi-foisorul-a"); appended to '
  '@orders.hir.ro to form the full address. secret is a per-tenant token '
  'embedded in the Cloudflare Email Worker forward URL.';

-- alias_local must be a-z 0-9 dash, 3..40 chars (DNS-friendly, no dots
-- so we can safely concatenate with @orders.hir.ro).
alter table public.aggregator_intake_aliases
  drop constraint if exists aggregator_intake_aliases_alias_local_format;
alter table public.aggregator_intake_aliases
  add constraint aggregator_intake_aliases_alias_local_format
  check (alias_local ~ '^[a-z0-9][a-z0-9-]{2,38}[a-z0-9]$');

-- RLS: tenant members can read their own alias; nobody from anon or
-- authenticated may insert/update/delete (alias provisioning is an
-- admin action that goes through service_role from the Edge Function +
-- a server action in /dashboard/settings/aggregator-intake).
alter table public.aggregator_intake_aliases enable row level security;

drop policy if exists aggregator_intake_aliases_select_own
  on public.aggregator_intake_aliases;
create policy aggregator_intake_aliases_select_own
  on public.aggregator_intake_aliases for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = aggregator_intake_aliases.tenant_id
        and tm.user_id = auth.uid()
    )
  );

revoke all on table public.aggregator_intake_aliases from anon;
revoke insert, update, delete on table public.aggregator_intake_aliases from authenticated;

-- ── 3. aggregator_email_jobs ────────────────────────────────────────────
-- One row per inbound email. Lifecycle:
--   RECEIVED  → row inserted, raw stored
--   PARSING   → Anthropic call in flight
--   PARSED    → parse_data populated, awaiting auto-apply or manual review
--   APPLIED   → restaurant_orders row created (applied_order_id set)
--   FAILED    → parser returned non-JSON or Anthropic errored
--   SKIPPED   → sender domain not GLOVO/WOLT/BOLT_FOOD
create table if not exists public.aggregator_email_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  raw_email_path text,
  sender text,
  subject text,
  received_at timestamptz not null default now(),
  status text not null default 'RECEIVED'
    check (status in ('RECEIVED','PARSING','PARSED','APPLIED','FAILED','SKIPPED')),
  detected_source text,
  parsed_data jsonb,
  applied_order_id uuid references public.restaurant_orders(id) on delete set null,
  error_text text,
  created_at timestamptz not null default now()
);

create index if not exists aggregator_email_jobs_tenant_received_idx
  on public.aggregator_email_jobs (tenant_id, received_at desc);
create index if not exists aggregator_email_jobs_status_idx
  on public.aggregator_email_jobs (status, received_at desc);

comment on table public.aggregator_email_jobs is
  'Audit + queue for Glovo/Wolt/Bolt Food order intake via forwarded '
  'restaurant email. raw_email_path points into the "aggregator-emails" '
  'private storage bucket. parsed_data is the Anthropic JSON output.';

-- RLS: tenant members read their own jobs. No anon/authenticated writes.
alter table public.aggregator_email_jobs enable row level security;

drop policy if exists aggregator_email_jobs_select_own
  on public.aggregator_email_jobs;
create policy aggregator_email_jobs_select_own
  on public.aggregator_email_jobs for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = aggregator_email_jobs.tenant_id
        and tm.user_id = auth.uid()
    )
  );

revoke all on table public.aggregator_email_jobs from anon;
revoke insert, update, delete on table public.aggregator_email_jobs from authenticated;

-- ── 4. storage bucket for raw emails ────────────────────────────────────
-- Private bucket, service_role only. Files keyed by
-- <tenant_id>/<year>/<month>/<job_id>.eml.
insert into storage.buckets (id, name, public)
values ('aggregator-emails', 'aggregator-emails', false)
on conflict (id) do nothing;

-- Storage RLS: the "aggregator-emails" bucket is service_role only.
-- Supabase RLS on `storage.objects` is permissive: a user gets access only
-- if SOME policy returns true. By NOT creating any anon/authenticated
-- policy that targets `bucket_id = 'aggregator-emails'`, those roles have
-- no read/write path. Other buckets are unaffected — we never reference
-- them here, so their existing policies still apply.
--
-- We deliberately do NOT add a deny policy because Postgres RLS doesn't
-- support deny-overrides; an explicit `using (false)` policy that names
-- a single bucket has no effect on top of the absence of any matching
-- allow policy. service_role bypasses RLS by Supabase design.
do $$ begin
  -- no-op block; documents the deliberate "no policy = no access" stance
  -- for the aggregator-emails bucket.
  null;
end $$;
