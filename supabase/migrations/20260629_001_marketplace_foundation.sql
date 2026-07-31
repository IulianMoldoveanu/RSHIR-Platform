-- Lane HIRforYOU-MARKETPLACE (2026-05-28) — consumer marketplace foundation.
--
-- Schema for the hirforyou.ro consumer aggregator MVP. Different surface
-- from the existing `aggregator_email_intake` system (which reverses Glovo /
-- Wolt / Bolt emails into the tenant KDS) — that one keeps the `aggregator_*`
-- prefix. The consumer marketplace deliberately uses `marketplace_*` to keep
-- the two concerns visually separated in the schema. The route surface stays
-- `/restaurante/*` (Romanian-first), the admin toggle is exposed as
-- `aggregator_enabled` on tenants for the patron-facing copy (the patron
-- thinks "appear on the HIR aggregator"), but the data lives under
-- `marketplace_*`.
--
-- Touches (all ADDITIVE, no destructive ALTERs):
--   • new public.marketplace_customers
--   • new public.marketplace_reviews
--   • new columns on tenants: aggregator_enabled (bool), aggregator_visibility (enum-like text)
--   • new columns on restaurant_orders: marketplace_customer_id (uuid), order_source (text)
--   • new materialized view public.marketplace_directory
--   • new function refresh_marketplace_directory()
--   • RLS policies for both new tables
--
-- Soft launch when 5-10 RO tenants are live. Until then this PR stays DRAFT
-- and the materialized view returns an empty set because tenants default
-- `aggregator_enabled=false` and `aggregator_visibility='private'`.

-- ───────────────────────────────────────────────────────────────────────
-- 1. marketplace_customers — UNIFIED accounts cross-tenant
--    Distinct from per-tenant `public.customers` rows. One marketplace
--    customer can place orders at many tenants over time. Customers can
--    optionally bind to Supabase auth.users for login; phone/email-only
--    accounts (guest checkout with magic link) work without auth_user_id.
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.marketplace_customers (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  full_name text,
  preferred_city text,
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  -- Soft uniqueness: nullable email/phone but both must be unique when set.
  -- Partial unique indexes below enforce this without rejecting NULLs.
  constraint marketplace_customers_email_or_phone check (email is not null or phone is not null)
);

-- Partial unique indexes so multiple anonymous rows with NULL email/phone
-- cannot collide (Postgres NULLs are distinct in unique indexes already, but
-- a partial WHERE is cleaner and matches the conditional uniqueness intent).
create unique index if not exists uniq_marketplace_customers_email
  on public.marketplace_customers(email)
  where email is not null;
create unique index if not exists uniq_marketplace_customers_phone
  on public.marketplace_customers(phone)
  where phone is not null;
create index if not exists idx_marketplace_customers_auth_user
  on public.marketplace_customers(auth_user_id)
  where auth_user_id is not null;
create index if not exists idx_marketplace_customers_last_active
  on public.marketplace_customers(last_active_at desc);

comment on table public.marketplace_customers is
  'HIRforYOU consumer-marketplace customer (cross-tenant identity). '
  'One row per unique email/phone. Bind to auth.users for password-less '
  'login once the customer signs in; guest checkouts stay null on '
  'auth_user_id until the magic-link upgrade.';

-- ───────────────────────────────────────────────────────────────────────
-- 2. restaurant_orders — additive columns to track marketplace orders.
--    `order_source = 'direct'` means tenant storefront / `/m/<slug>` /
--    POS / aggregator-email-intake. `'marketplace'` means hirforyou.ro
--    consumer flow. The HIR take rate (2 RON flat per marketplace order)
--    is applied weekly via connect-invoice-weekly Edge Function — that
--    function reads `order_source` to compute the take.
-- ───────────────────────────────────────────────────────────────────────
alter table public.restaurant_orders
  add column if not exists marketplace_customer_id uuid
    references public.marketplace_customers(id) on delete set null;
alter table public.restaurant_orders
  add column if not exists order_source text not null default 'direct';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'restaurant_orders_order_source_check'
  ) then
    alter table public.restaurant_orders
      add constraint restaurant_orders_order_source_check
      check (order_source in ('direct', 'marketplace'));
  end if;
end$$;

create index if not exists idx_orders_marketplace_customer
  on public.restaurant_orders(marketplace_customer_id)
  where marketplace_customer_id is not null;
create index if not exists idx_orders_source
  on public.restaurant_orders(order_source)
  where order_source <> 'direct';

-- ───────────────────────────────────────────────────────────────────────
-- 3. marketplace_reviews — unified 1-5 rating per (tenant, customer, order).
--    Orders limit one review per (tenant, customer, order) so a customer
--    cannot stack reviews on the same purchase. Public read so the
--    directory page can show ratings; insert is auth-gated to a customer's
--    own marketplace_customers row.
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  marketplace_customer_id uuid not null
    references public.marketplace_customers(id) on delete cascade,
  order_id uuid references public.restaurant_orders(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (tenant_id, marketplace_customer_id, order_id)
);
create index if not exists idx_marketplace_reviews_tenant
  on public.marketplace_reviews(tenant_id, created_at desc);
create index if not exists idx_marketplace_reviews_customer
  on public.marketplace_reviews(marketplace_customer_id, created_at desc);

comment on table public.marketplace_reviews is
  'Consumer reviews left on a marketplace order. Public read (RLS), self-'
  'write (the marketplace_customer must match auth.uid()). Rating 1-5.';

-- ───────────────────────────────────────────────────────────────────────
-- 4. tenants — marketplace opt-in columns.
--    `aggregator_enabled` defaults false: every tenant is invisible until
--    OWNER flips the toggle in /dashboard/settings/aggregator. Visibility
--    levels:
--      • 'private'      — tenant opted in but only HIR-internal QA sees it
--      • 'public'       — appears in /restaurante directory
--      • 'invite_only'  — accessible by direct URL but not listed
--    Default = 'private' so toggling `aggregator_enabled=true` alone is
--    not enough to expose a tenant publicly. OWNER must also set
--    visibility='public' explicitly.
-- ───────────────────────────────────────────────────────────────────────
alter table public.tenants
  add column if not exists aggregator_enabled boolean not null default false;
alter table public.tenants
  add column if not exists aggregator_visibility text not null default 'private';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_aggregator_visibility_check'
  ) then
    alter table public.tenants
      add constraint tenants_aggregator_visibility_check
      check (aggregator_visibility in ('private', 'public', 'invite_only'));
  end if;
end$$;

comment on column public.tenants.aggregator_enabled is
  'Patron has opted into the HIRforYOU consumer marketplace. '
  'Default false. Flip from /dashboard/settings/aggregator.';
comment on column public.tenants.aggregator_visibility is
  'Visibility level once aggregator_enabled=true. '
  '`private` (default) = invisible. `public` = listed in /restaurante. '
  '`invite_only` = reachable by direct URL but not listed.';

-- ───────────────────────────────────────────────────────────────────────
-- 5. marketplace_directory materialized view — denormalized read model for
--    the /restaurante index + city pages. Refreshed CONCURRENTLY at 02:00
--    UTC so daily writes never block the public-facing page. Unique index
--    on tenant_id is REQUIRED for REFRESH CONCURRENTLY.
--
--    Includes only tenants where aggregator_enabled=true AND
--    aggregator_visibility='public'. Reviews and 30-day order counts are
--    pre-aggregated so the directory page is a single index scan + filter.
-- ───────────────────────────────────────────────────────────────────────
drop materialized view if exists public.marketplace_directory;
create materialized view public.marketplace_directory as
select
  t.id                                                                  as tenant_id,
  t.slug                                                                as slug,
  t.name                                                                as name,
  t.custom_domain                                                       as custom_domain,
  coalesce(
    (t.settings -> 'branding' ->> 'logo_url'),
    t.settings ->> 'logo_url'
  )                                                                     as logo_url,
  t.settings ->> 'tagline'                                              as tagline,
  t.settings ->> 'restaurant_type'                                      as restaurant_type,
  t.city_id                                                             as city_id,
  c.slug                                                                as city_slug,
  c.name                                                                as city_name,
  coalesce(avg(r.rating)::numeric(3,2), 0::numeric(3,2))                as avg_rating,
  count(distinct r.id)                                                  as review_count,
  count(distinct o.id) filter (
    where o.created_at > now() - interval '30 days'
      and o.status not in ('CANCELLED')
  )                                                                     as orders_last_30d,
  t.aggregator_enabled,
  t.aggregator_visibility
from public.tenants t
left join public.cities c on c.id = t.city_id
left join public.marketplace_reviews r on r.tenant_id = t.id
left join public.restaurant_orders o on o.tenant_id = t.id
where t.aggregator_enabled = true
  and t.aggregator_visibility = 'public'
  and t.status = 'ACTIVE'
group by t.id, c.slug, c.name;

create unique index if not exists idx_marketplace_directory_tenant
  on public.marketplace_directory(tenant_id);
create index if not exists idx_marketplace_directory_city
  on public.marketplace_directory(city_slug);
create index if not exists idx_marketplace_directory_rating
  on public.marketplace_directory(avg_rating desc);

comment on materialized view public.marketplace_directory is
  'Denormalized read model for /restaurante pages. Refreshed nightly '
  'by cron via refresh_marketplace_directory(). Only contains tenants '
  'where aggregator_enabled=true AND aggregator_visibility=public AND '
  'status=ACTIVE.';

-- ───────────────────────────────────────────────────────────────────────
-- 6. Refresh helper — wrapped in a SECURITY DEFINER function so the cron
--    runner can call it without needing direct table privileges.
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.refresh_marketplace_directory()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  refresh materialized view concurrently public.marketplace_directory;
end;
$$;

revoke all on function public.refresh_marketplace_directory() from public;
grant execute on function public.refresh_marketplace_directory() to service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 7. RLS — marketplace_customers (self-read / self-update only)
--    Public anon cannot read other customers' data. The /cont page reads
--    via the authenticated user's auth.uid() match.
-- ───────────────────────────────────────────────────────────────────────
alter table public.marketplace_customers enable row level security;

drop policy if exists "marketplace_customers_self_read" on public.marketplace_customers;
create policy "marketplace_customers_self_read"
  on public.marketplace_customers
  for select
  using (auth.uid() = auth_user_id);

drop policy if exists "marketplace_customers_self_update" on public.marketplace_customers;
create policy "marketplace_customers_self_update"
  on public.marketplace_customers
  for update
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- service_role bypasses RLS by design; explicit GRANT for clarity.
grant all on public.marketplace_customers to service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 8. RLS — marketplace_reviews
--    SELECT is public so the directory + restaurant pages can render
--    ratings without auth. INSERT requires the authenticated user own
--    the marketplace_customer row (no impersonation).
-- ───────────────────────────────────────────────────────────────────────
alter table public.marketplace_reviews enable row level security;

drop policy if exists "marketplace_reviews_public_read" on public.marketplace_reviews;
create policy "marketplace_reviews_public_read"
  on public.marketplace_reviews
  for select
  using (true);

drop policy if exists "marketplace_reviews_self_insert" on public.marketplace_reviews;
create policy "marketplace_reviews_self_insert"
  on public.marketplace_reviews
  for insert
  with check (
    exists (
      select 1 from public.marketplace_customers mc
      where mc.id = marketplace_customer_id
        and mc.auth_user_id = auth.uid()
    )
  );

grant select on public.marketplace_reviews to anon, authenticated;
grant insert on public.marketplace_reviews to authenticated;
grant all on public.marketplace_reviews to service_role;
