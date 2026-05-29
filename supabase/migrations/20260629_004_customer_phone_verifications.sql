-- Migration: customer_phone_verifications
-- Backs the storefront checkout OTP step (P0 audit #5). Before allowing a
-- COD or CARD order to be created, the storefront forces the customer to
-- prove they control the phone they typed in. Without this, anyone can
-- flood arbitrary RO numbers with PENDING orders (fraud + harassment).
--
-- Lifecycle:
--   1. POST /api/checkout/otp/request → INSERT a fresh row keyed by
--      (phone, created_at). code_hash = sha256(code + pepper).
--      expires_at = now()+5min.
--   2. POST /api/checkout/otp/verify → look up the LATEST un-verified row for
--      this phone (ORDER BY created_at DESC LIMIT 1), check expiry, compare
--      hash, increment attempts, set verified_at on success.
--   3. /api/checkout/intent reads verified_at to gate order creation
--      (a separate PR wires the gate; this migration just provides the
--      table — defense-in-depth lives in the route handler).
--
-- NOTE: original revision used a unique partial index `WHERE expires_at > now()`
-- — Postgres rejects now() in index predicates (must be IMMUTABLE). The route
-- handler dedupes by selecting the newest row, so a regular composite index
-- on (phone, created_at desc) is sufficient.

create table if not exists public.customer_phone_verifications (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Covers the verify lookup: WHERE phone = ? ORDER BY created_at DESC LIMIT 1.
create index if not exists customer_phone_verifications_phone_idx
  on public.customer_phone_verifications (phone, created_at desc);

-- Maintenance: ops can prune rows older than ~24h with a cron job to keep
-- row count from drifting.
create index if not exists customer_phone_verifications_created_at_idx
  on public.customer_phone_verifications (created_at);

alter table public.customer_phone_verifications enable row level security;

-- Service-role only. No anon/auth read or write — the route handler uses
-- the service-role client (bypasses RLS). RLS is enabled defensively so
-- a misconfigured anon client cannot scrape OTP codes.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'customer_phone_verifications'
      and policyname = 'customer_phone_verifications_service_role_only'
  ) then
    create policy "customer_phone_verifications_service_role_only"
      on public.customer_phone_verifications
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;
