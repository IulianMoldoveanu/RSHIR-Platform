-- HIR Restaurant Suite - RSHIR-33 Promo codes
-- Tenants create discount codes; customers redeem at checkout.
-- Idempotent: re-running the migration is a no-op.
--
-- Kinds:
--   PERCENT       - value_int is 0-100 (e.g. 10 = 10% off subtotal)
--   FIXED         - value_int is RON-off integer (e.g. 10 = 10 RON off)
--   FREE_DELIVERY - value_int ignored; discount equals delivery_fee_ron
-- Discount is capped at subtotal so total never goes below zero (server-
-- enforced in pricing.ts).

create extension if not exists "citext";

-- ============================================================
-- TABLES
-- ============================================================
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code citext not null,
  kind text not null check (kind in ('PERCENT','FIXED','FREE_DELIVERY')),
  value_int integer not null default 0,
  min_order_ron numeric(10,2) not null default 0,
  max_uses integer,
  used_count integer not null default 0,
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists promo_codes_tenant_code_uq
  on public.promo_codes (tenant_id, lower(code::text));

create index if not exists promo_codes_tenant_active
  on public.promo_codes (tenant_id, is_active);

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id) on delete cascade,
  order_id uuid not null references public.restaurant_orders(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists promo_redemptions_promo
  on public.promo_redemptions (promo_code_id);

-- ============================================================
-- restaurant_orders extension
-- ============================================================
alter table public.restaurant_orders
  add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null,
  add column if not exists discount_ron numeric(10,2) not null default 0;

-- ============================================================
-- RLS
-- promo_codes: tenant members CRUD their tenant's rows. Anon SELECT is
-- intentionally left CLOSED — the storefront validate endpoint runs under
-- service-role (lib/supabase-admin.ts) so anon never needs direct access.
-- promo_redemptions: writes via service-role only (claim function).
-- ============================================================
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

drop policy if exists "promo_codes_member_all" on public.promo_codes;
create policy "promo_codes_member_all"
  on public.promo_codes for all
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

drop policy if exists "promo_redemptions_member_select" on public.promo_redemptions;
create policy "promo_redemptions_member_select"
  on public.promo_redemptions for select
  to authenticated
  using (
    exists (
      select 1
      from public.promo_codes pc
      where pc.id = promo_redemptions.promo_code_id
        and public.is_tenant_member(pc.tenant_id)
    )
  );

-- ============================================================
-- Atomic claim function
-- Wraps the redemption insert + used_count increment in a single
-- transaction. Idempotent on order_id (the unique index on
-- promo_redemptions.order_id makes a re-claim a no-op rather than a
-- duplicate increment). Rejects when used_count would exceed max_uses,
-- closing the race where N parallel checkouts on a max_uses=1 code could
-- otherwise all read used_count=0 before any insert.
-- ============================================================
create or replace function public.claim_promo_redemption(
  p_promo_id uuid,
  p_order_id uuid,
  p_customer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer;
  v_used integer;
  v_inserted integer;
begin
  -- Lock the promo row for the duration of the txn.
  select max_uses, used_count into v_max, v_used
  from public.promo_codes
  where id = p_promo_id
  for update;

  if not found then
    return false;
  end if;

  if v_max is not null and v_used >= v_max then
    return false;
  end if;

  insert into public.promo_redemptions (promo_code_id, order_id, customer_id)
  values (p_promo_id, p_order_id, p_customer_id)
  on conflict (order_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    -- Already redeemed for this order (idempotent retry). Do not bump
    -- used_count again.
    return true;
  end if;

  update public.promo_codes
  set used_count = used_count + 1
  where id = p_promo_id;

  return true;
end;
$$;

revoke all on function public.claim_promo_redemption(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_promo_redemption(uuid, uuid, uuid) to service_role;

-- updated_at trigger not needed (no updated_at column on these tables).
