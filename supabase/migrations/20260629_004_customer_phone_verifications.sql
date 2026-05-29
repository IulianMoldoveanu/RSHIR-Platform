-- Migration: customer_phone_verifications
-- Backs the storefront checkout OTP step (P0 audit #5). Before allowing a
-- COD or CARD order to be created, the storefront forces the customer to
-- prove they control the phone they typed in. Without this, anyone can
-- flood arbitrary RO numbers with PENDING orders (fraud + harassment).
--
-- Lifecycle:
--   1. POST /api/checkout/otp/request → INSERT (or UPDATE) a row keyed by
--      (phone). code_hash = sha256(code + pepper). expires_at = now()+5min.
--   2. POST /api/checkout/otp/verify → look up by phone, check expiry,
--      compare hash, increment attempts, set verified_at on success.
--   3. /api/checkout/intent reads verified_at to gate order creation
--      (a separate PR wires the gate; this migration just provides the
--      table — defense-in-depth lives in the route handler).
--
-- Indexes: unique partial on phone WHERE expires_at > now() so a fresh
-- request always supersedes any stale row for the same number.

create table if not exists public.customer_phone_verifications (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null,
  code_hash     text not null,
  expires_at    timestamptz not null,
  attempts      int not null default 0,
  verified_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- Only one ACTIVE (un-expired) row per phone. A new /request always
-- shadows the previous row by extending expires_at (UPSERT pattern in the
-- route handler).
create unique index if not exists customer_phone_verifications_phone_active_uq
  on public.customer_phone_verifications (phone)
  where expires_at > now();

-- Maintenance: ops can prune rows older than ~24h with a cron job. Not
-- strictly required because the unique partial index already keeps the
-- active set small, but keeps row count from drifting.
create index if not exists customer_phone_verifications_created_at_idx
  on public.customer_phone_verifications (created_at);

alter table public.customer_phone_verifications enable row level security;

-- Service-role only. No anon/auth read or write — the route handler uses
-- the service-role client (bypasses RLS). RLS is enabled defensively so
-- a misconfigured anon client cannot scrape OTP codes.
create policy "customer_phone_verifications_service_role_only"
  on public.customer_phone_verifications
  for all
  to service_role
  using (true)
  with check (true);
