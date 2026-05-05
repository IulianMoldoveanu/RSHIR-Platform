-- Self-serve Stripe Connect onboarding requests submitted by restaurant OWNERs.
-- Platform admins review these and flip status to APPROVED/REJECTED.
-- Tenants do not configure Stripe Connect themselves (platform-level account),
-- so this table is the queue between owner intent and platform action.

create table if not exists stripe_onboarding_requests (
  id uuid default gen_random_uuid() primary key,
  tenant_id text not null,
  business_name text not null,
  vat_number text,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists stripe_onboarding_requests_tenant_idx
  on stripe_onboarding_requests (tenant_id, created_at desc);

alter table stripe_onboarding_requests enable row level security;

-- Tenant owns its own requests. Reads use the app.tenant_id GUC set by the
-- request-scoped helper; service-role writes (server actions) bypass RLS.
drop policy if exists "tenant owns request" on stripe_onboarding_requests;
create policy "tenant owns request" on stripe_onboarding_requests
  for all using (tenant_id = current_setting('app.tenant_id', true));
