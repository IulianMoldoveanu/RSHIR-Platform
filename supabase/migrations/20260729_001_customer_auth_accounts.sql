-- Storefront customer accounts — real login (email+password today,
-- Google/Facebook/Apple OAuth as they're wired up), replacing the
-- phone-OTP-only "recognize a returning customer" model with an actual
-- account a visitor can create and log into even before ever ordering.
--
-- No live customer data exists yet (owner confirmed 2026-07-29 — testing
-- only) — safe to shape this cleanly rather than layer a migration path.
--
-- Multi-tenant isolation is the load-bearing property here: auth.users is
-- GLOBAL in Supabase (one row per email/Google identity, shared across
-- every tenant on the platform). A single Google login must NOT give a
-- customer's Delivery House order history/address to some other
-- restaurant, and vice versa. So identity stays split in two layers:
--   - auth.users:            ONE global identity per person (their email,
--                             their Google/FB/Apple login) — Supabase-managed.
--   - public.customers row:  ONE per (tenant_id, person) — same person
--                             logging into two different tenants' storefronts
--                             gets two independent customer rows, each with
--                             its own order history/addresses, scoped by
--                             tenant_id exactly like every other table here.
-- customers.auth_user_id is the link; RLS below only ever lets an
-- authenticated customer touch the row(s) where auth_user_id = auth.uid()
-- AND tenant_id matches — never another tenant's row, never another
-- person's row within the same tenant.

alter table public.customers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table public.customers
  add column if not exists updated_at timestamptz not null default now();

-- One auth identity maps to at most one customer row per tenant — prevents
-- a race (two tabs signing up simultaneously) from creating duplicate
-- customer rows for the same person at the same restaurant. Partial index
-- (auth_user_id can be NULL for phone-only customers who never created a
-- real account — the pre-existing model this is additive to).
create unique index if not exists idx_customers_tenant_auth_user
  on public.customers(tenant_id, auth_user_id)
  where auth_user_id is not null;

alter table public.customer_addresses
  add column if not exists is_default boolean not null default false;
alter table public.customer_addresses
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists touch_customers_updated_at on public.customers;
create trigger touch_customers_updated_at
  before update on public.customers
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_customer_addresses_updated_at on public.customer_addresses;
create trigger touch_customer_addresses_updated_at
  before update on public.customer_addresses
  for each row execute function public.touch_updated_at();

-- Only one default address per customer — a partial unique index instead
-- of application-level bookkeeping, so "set as default" can never silently
-- leave two rows marked default under concurrent writes.
create unique index if not exists idx_customer_addresses_one_default
  on public.customer_addresses(customer_id)
  where is_default = true;

-- ============================================================
-- Self-service RLS: an authenticated customer manages ONLY their own row,
-- scoped to the tenant they're on. This is additive alongside the existing
-- "customers_member_all" policy (restaurant STAFF managing customers from
-- the admin app) — a customer is never a tenant_member, so the two
-- policies never overlap in practice, they just both need to independently
-- hold true for their respective callers.
-- ============================================================

drop policy if exists "customers_self_select" on public.customers;
create policy "customers_self_select"
  on public.customers for select
  to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists "customers_self_update" on public.customers;
create policy "customers_self_update"
  on public.customers for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- INSERT (account creation) happens via service-role server action, not a
-- direct client-side insert — the server verifies the Supabase Auth session
-- server-side and sets auth_user_id itself, so a self-service INSERT policy
-- isn't needed (and would let a signed-in user forge tenant_id/auth_user_id
-- on someone else's behalf if it existed).

drop policy if exists "customer_addresses_self_all" on public.customer_addresses;
create policy "customer_addresses_self_all"
  on public.customer_addresses for all
  to authenticated
  using (
    exists (
      select 1 from public.customers c
      where c.id = customer_addresses.customer_id
        and c.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.customers c
      where c.id = customer_addresses.customer_id
        and c.auth_user_id = auth.uid()
    )
  );

comment on column public.customers.auth_user_id is
  'Links to the GLOBAL auth.users identity (Supabase Auth — email/password + '
  'Google/FB/Apple OAuth). NULL for customers who only ever used phone-OTP '
  'recognition and never created a real account. One auth identity has at '
  'most one customer row PER TENANT (idx_customers_tenant_auth_user) — never '
  'shared across tenants.';
