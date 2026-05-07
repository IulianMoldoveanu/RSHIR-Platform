-- Lane AB-TESTING-FRAMEWORK-STUB — minimal foundation (Option B).
--
-- Adds ONLY the `experiments` table — registry of named experiments with
-- variants + active flag. Sticky assignment lives in a client cookie
-- (NOT in Postgres) so the storefront does not pay an extra round-trip
-- per page. Metric events + assignment persistence are intentionally
-- DEFERRED: the first concrete consumer (Marketing / Menu / Ops sub-agent
-- when they land) will add `experiment_metric_events` together with a
-- proper retention plan as part of THEIR lane. Building those tables now
-- with no caller would create dead schema.
--
-- Decisions baked in:
--   - Variant assignment is deterministic from
--     hash(experiment_key + subject_id) — same subject always lands in
--     the same bucket without storing the assignment server-side.
--   - Subject is whatever the caller passes (customer cookie id /
--     auth.users.id / tenant_id). Each experiment picks its own.
--   - `tenant_id` is nullable: platform-wide experiments (e.g.
--     marketing landing copy) belong to no tenant.
--   - Variants stored as a jsonb array of {key, weight} where weights
--     are positive integers summed and normalised at read time. Empty
--     or zero-sum variants disable the experiment.
--
-- All changes ADDITIVE + IDEMPOTENT. Safe to re-apply.

create table if not exists public.experiments (
  id          uuid primary key default gen_random_uuid(),
  -- Stable string the code references (e.g. 'storefront_hero_copy_v1').
  -- One row per key per tenant scope; platform-wide rows have null tenant.
  key         text not null,
  tenant_id   uuid references public.tenants(id) on delete cascade,
  -- Human note for the operator. Not surfaced to users.
  description text,
  -- jsonb array of {key: text, weight: int >= 1}. Example:
  --   [{"key":"control","weight":50},{"key":"variant_a","weight":50}]
  -- Validated at read time; an invalid shape disables the experiment
  -- (falls back to first declared variant or null) so a typo never
  -- breaks the storefront.
  variants    jsonb not null default '[]'::jsonb,
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One key per tenant scope. Platform-wide rows (tenant_id null) get a
-- separate partial unique so we can have both a global 'hero_copy_v1'
-- and a per-tenant 'hero_copy_v1' override later if we want.
create unique index if not exists experiments_key_tenant_uidx
  on public.experiments (key, tenant_id)
  where tenant_id is not null;

create unique index if not exists experiments_key_global_uidx
  on public.experiments (key)
  where tenant_id is null;

create index if not exists experiments_active_idx
  on public.experiments (active) where active = true;

comment on table public.experiments is
  'A/B testing registry (Option B minimal stub). One row = one named '
  'experiment with weighted variants. Sticky assignment lives in a client '
  'cookie keyed by experiment key; subject hashing is deterministic. '
  'Metric events + admin UI deferred to first sub-agent consumer.';

comment on column public.experiments.variants is
  'jsonb array of {key:text, weight:int>=1}. Weights summed and '
  'normalised at read time. Invalid shape disables the experiment.';

alter table public.experiments enable row level security;

-- Service-role-only for now (mirrors psp_credentials + reseller schema).
-- Reads happen via server helpers using the service-role client; the
-- client hook receives a single resolved variant key, not the table.
drop policy if exists experiments_service_role_only on public.experiments;
create policy experiments_service_role_only
  on public.experiments
  for all
  to service_role
  using (true)
  with check (true);
