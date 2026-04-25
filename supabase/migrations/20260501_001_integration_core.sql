-- HIR Restaurant Suite — Sprint 11 / RSHIR-49 Integration core
-- Schema for the multi-mode POS integration architecture (STANDALONE,
-- POS_PUSH, POS_PULL, BIDIRECTIONAL). Default for every existing tenant
-- is STANDALONE so this migration is a no-op for current pilots.
-- Idempotent: re-runnable.

-- ============================================================
-- 1) Enums
-- ============================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'integration_mode') then
    create type integration_mode as enum (
      'STANDALONE','POS_PUSH','POS_PULL','BIDIRECTIONAL'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'order_source') then
    create type order_source as enum (
      'INTERNAL_STOREFRONT','EXTERNAL_API','POS_PUSH','MANUAL_ADMIN'
    );
  end if;
end $$;

-- ============================================================
-- 2) Tenant column
-- ============================================================
alter table public.tenants
  add column if not exists integration_mode integration_mode not null default 'STANDALONE';

-- ============================================================
-- 3) Order source column
-- ============================================================
alter table public.restaurant_orders
  add column if not exists source order_source not null default 'INTERNAL_STOREFRONT';

-- ============================================================
-- 4) integration_providers — per-tenant config + secrets
-- ============================================================
create table if not exists public.integration_providers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null check (provider_key in ('mock','iiko','smartcash','freya','posnet','custom')),
  display_name text not null,
  config jsonb not null default '{}',
  webhook_secret text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, provider_key)
);

create index if not exists integration_providers_tenant_active_idx
  on public.integration_providers (tenant_id)
  where is_active = true;

alter table public.integration_providers enable row level security;

drop policy if exists integration_providers_member_read on public.integration_providers;
create policy integration_providers_member_read
  on public.integration_providers
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = integration_providers.tenant_id
        and tm.user_id  = auth.uid()
    )
  );

-- Writes flow through the service-role client only (admin server actions).
drop policy if exists integration_providers_no_direct_write on public.integration_providers;
create policy integration_providers_no_direct_write
  on public.integration_providers
  for insert
  to authenticated
  with check (false);

-- ============================================================
-- 5) integration_events — async dispatch queue with retries
-- ============================================================
create table if not exists public.integration_events (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'PENDING'
    check (status in ('PENDING','SENT','FAILED','DEAD')),
  attempts int not null default 0,
  last_error text,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists integration_events_pending_idx
  on public.integration_events (status, scheduled_for)
  where status = 'PENDING';

create index if not exists integration_events_tenant_created_idx
  on public.integration_events (tenant_id, created_at desc);

alter table public.integration_events enable row level security;

drop policy if exists integration_events_member_read on public.integration_events;
create policy integration_events_member_read
  on public.integration_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = integration_events.tenant_id
        and tm.user_id  = auth.uid()
    )
  );

-- ============================================================
-- 6) tenant_api_keys — for Mode B "POS posts orders to us"
-- ============================================================
-- Auth model: caller sends `Authorization: Bearer hir_<32-byte-base64url>`.
-- Server hashes the raw key with SHA-256 (256 bits of input entropy means
-- bcrypt's slowdown adds nothing useful; sha256 lookup is O(1) via the
-- unique index). Raw key is shown ONCE at creation.
create table if not exists public.tenant_api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key_hash text not null unique,           -- 64-char lowercase hex sha256 of the raw key
  key_prefix text not null,                -- first 8 chars of raw key, displayed in UI for identification
  label text not null,
  scopes text[] not null default array['orders.write'],
  last_used_at timestamptz,
  is_active boolean not null default true,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists tenant_api_keys_tenant_active_idx
  on public.tenant_api_keys (tenant_id)
  where is_active = true;

alter table public.tenant_api_keys enable row level security;

drop policy if exists tenant_api_keys_member_read on public.tenant_api_keys;
create policy tenant_api_keys_member_read
  on public.tenant_api_keys
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = tenant_api_keys.tenant_id
        and tm.user_id  = auth.uid()
    )
  );
