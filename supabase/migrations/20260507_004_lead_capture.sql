-- Two narrow tables for marketing lead capture from public surfaces.
-- Service-role only; no RLS public policies. The data is sensitive
-- enough to deserve auth gating in any future admin UI but doesn't
-- need tenant scoping (these leads exist BEFORE a tenant exists).

create table if not exists public.storefront_notify_signups (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text,                    -- the tenant whose menu was empty when the customer signed up; NULL if from marketing path
  email text not null,
  created_at timestamptz not null default now(),
  ip text                              -- best-effort, for abuse triage; not PII for retention purposes
);
create index if not exists idx_storefront_notify_signups_email
  on public.storefront_notify_signups (email);
alter table public.storefront_notify_signups enable row level security;
-- no policies = service-role only

create table if not exists public.migrate_leads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('restaurant','reseller')),
  email text not null,
  name text,
  country text,
  city text,
  gloriafood_url text,
  restaurants_count int,               -- only for resellers
  ref_partner_code text,               -- captures the ?ref= partner code if set
  created_at timestamptz not null default now(),
  ip text
);
create index if not exists idx_migrate_leads_kind_created
  on public.migrate_leads (kind, created_at desc);
alter table public.migrate_leads enable row level security;
