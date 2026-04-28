-- HIR Restaurant Suite - Track A #11: newsletter subscribers
-- Storefront popup → double-opt-in → welcome email with 10% promo.
-- Idempotent: re-running the migration is a no-op.
--
-- Writes are service-role only (server actions in apps/restaurant-web).
-- Tenant members can SELECT their own rows for the admin marketing page.

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING','CONFIRMED','UNSUBSCRIBED','BOUNCED')),
  confirmation_token text not null,
  unsubscribe_token text not null,
  consent_at timestamptz,
  source text not null default 'storefront-popup'
    check (source in ('storefront-popup','storefront-checkout','admin-import','referral')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create index if not exists idx_newsletter_subscribers_tenant_status
  on public.newsletter_subscribers(tenant_id, status);

-- Token lookup indexes — confirmation/unsubscribe routes hit these for every
-- click-through. Both tokens are 64 hex chars and globally unique by design.
create index if not exists idx_newsletter_subscribers_confirmation_token
  on public.newsletter_subscribers(confirmation_token);
create index if not exists idx_newsletter_subscribers_unsubscribe_token
  on public.newsletter_subscribers(unsubscribe_token);

alter table public.newsletter_subscribers enable row level security;

drop policy if exists newsletter_subscribers_member_read on public.newsletter_subscribers;
create policy newsletter_subscribers_member_read
  on public.newsletter_subscribers for select to authenticated
  using (
    exists (select 1 from public.tenant_members tm
             where tm.tenant_id = newsletter_subscribers.tenant_id
               and tm.user_id = auth.uid())
  );
-- writes go via service-role only (server actions)
