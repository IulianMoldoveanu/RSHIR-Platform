-- Lane ONBOARD: Self-service onboarding wizard drafts.
--
-- The new /dashboard/onboarding/wizard collects info across 6 steps. We
-- persist a draft after each step so a flaky network or a "let me grab my
-- phone" interruption doesn't lose the patron's typing. Keyed per user +
-- tenant so the same OWNER can have at most one in-flight draft per tenant.
--
-- Additive only. No existing data touched. Safe to re-run.

create table if not exists public.tenant_onboarding_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  step int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tenant_onboarding_drafts_user_tenant_uk
  on public.tenant_onboarding_drafts (user_id, tenant_id);

create index if not exists tenant_onboarding_drafts_user_idx
  on public.tenant_onboarding_drafts (user_id);

-- updated_at trigger. Mirror the convention used elsewhere in the schema.
create or replace function public.tenant_onboarding_drafts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tenant_onboarding_drafts_updated_at
  on public.tenant_onboarding_drafts;
create trigger tenant_onboarding_drafts_updated_at
  before update on public.tenant_onboarding_drafts
  for each row execute function public.tenant_onboarding_drafts_set_updated_at();

-- RLS: owner of the row reads + writes their own draft. Service-role bypasses.
alter table public.tenant_onboarding_drafts enable row level security;

drop policy if exists "tenant_onboarding_drafts_owner_read"
  on public.tenant_onboarding_drafts;
create policy "tenant_onboarding_drafts_owner_read"
  on public.tenant_onboarding_drafts for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "tenant_onboarding_drafts_owner_write"
  on public.tenant_onboarding_drafts;
create policy "tenant_onboarding_drafts_owner_write"
  on public.tenant_onboarding_drafts for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
