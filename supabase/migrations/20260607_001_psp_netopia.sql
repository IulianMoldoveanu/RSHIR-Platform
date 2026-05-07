-- HIR Restaurant Suite — Netopia PSP integration scaffold
-- Additive schema only. All tables admin-gated (service-role only) at the
-- RLS layer; merchant config UI reads/writes via server actions using the
-- admin client, mirroring the SmartBill + payment_disputes pattern.
--
-- Two operating modes are encoded per-row:
--   - 'MARKETPLACE' — HIR is master merchant, sub-merchants per tenant
--     (post-partnership, requires Netopia commercial agreement).
--   - 'STANDARD'    — Each tenant has its own Netopia merchant credentials,
--     HIR dispatches per-tenant payment intents and bills commission via
--     a separate run.
-- Mode is chosen at onboarding and stored on `psp_credentials.mode`.
--
-- Idempotent. Safe to re-apply.

-- ============================================================
-- Tenant-scoped Netopia credentials
-- ============================================================
create table if not exists public.psp_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('netopia')),
  mode text not null check (mode in ('MARKETPLACE', 'STANDARD')),
  -- Netopia credentials. For STANDARD mode each tenant fills its own.
  -- For MARKETPLACE mode the master HIR signature is set once at the
  -- platform level and the per-tenant row stores the sub-merchant id only.
  signature text,
  api_key_encrypted text,
  sub_merchant_id text,
  -- Sandbox vs live. Default live=false; flips after Iulian smokes the
  -- adapter end-to-end against Netopia sandbox.
  live boolean not null default false,
  active boolean not null default false,
  -- Free-form vendor metadata (e.g. notify_url override, account email)
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

create index if not exists psp_credentials_tenant_idx
  on public.psp_credentials(tenant_id);
create index if not exists psp_credentials_active_idx
  on public.psp_credentials(active) where active = true;

alter table public.psp_credentials enable row level security;

drop policy if exists psp_credentials_admin_only on public.psp_credentials;
create policy psp_credentials_admin_only
  on public.psp_credentials
  for all
  to authenticated
  using (false)
  with check (false);

-- ============================================================
-- Payment intent ledger
-- ============================================================
-- One row per intent we dispatch to Netopia. Status is the canonical
-- HIR-side view; raw vendor payload kept for forensics.
create table if not exists public.psp_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid references public.restaurant_orders(id) on delete set null,
  provider text not null check (provider in ('netopia')),
  mode text not null check (mode in ('MARKETPLACE', 'STANDARD')),
  -- Netopia order/transaction reference. Unique per provider so retries
  -- don't double-create.
  provider_ref text,
  amount_bani bigint not null,
  currency text not null default 'RON',
  status text not null default 'PENDING'
    check (status in ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'CANCELLED')),
  -- For MARKETPLACE mode: split commission tracked here so the settlement
  -- run can reconcile against psp_webhook_events without re-deriving fees.
  hir_fee_bani bigint,
  raw_request jsonb,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists psp_payments_provider_ref_uidx
  on public.psp_payments(provider, provider_ref)
  where provider_ref is not null;
create index if not exists psp_payments_tenant_idx
  on public.psp_payments(tenant_id);
create index if not exists psp_payments_order_idx
  on public.psp_payments(order_id);
create index if not exists psp_payments_status_idx
  on public.psp_payments(status);

alter table public.psp_payments enable row level security;

drop policy if exists psp_payments_admin_only on public.psp_payments;
create policy psp_payments_admin_only
  on public.psp_payments
  for all
  to authenticated
  using (false)
  with check (false);

-- ============================================================
-- Webhook event log (idempotency + forensics)
-- ============================================================
-- Mirrors the Stripe stripe_events_processed pattern from
-- 20260504_003_stripe_webhook_idempotency.sql. UNIQUE on (provider,
-- event_id) is the idempotency source of truth — webhook handler attempts
-- INSERT first, then runs side-effects only when a new row is claimed.
create table if not exists public.psp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('netopia')),
  event_id text not null,
  event_type text not null,
  payment_id uuid references public.psp_payments(id) on delete set null,
  raw_payload jsonb not null,
  processed_at timestamptz not null default now(),
  unique (provider, event_id)
);

create index if not exists psp_webhook_events_payment_idx
  on public.psp_webhook_events(payment_id);
create index if not exists psp_webhook_events_type_idx
  on public.psp_webhook_events(event_type);

alter table public.psp_webhook_events enable row level security;

drop policy if exists psp_webhook_events_admin_only on public.psp_webhook_events;
create policy psp_webhook_events_admin_only
  on public.psp_webhook_events
  for all
  to authenticated
  using (false)
  with check (false);
