-- HIR — Loyalty & Rewards (closes a key GloriaFood gap)
--
-- GloriaFood does NOT have native loyalty. HIR ships a points-based loyalty
-- system that earns from delivered orders and is redeemable at checkout
-- against a percentage of the order total.
--
-- Design:
--   loyalty_settings — per-tenant config (points-per-RON, redemption rate, expiry)
--   loyalty_accounts — per (tenant, customer) running balance
--   loyalty_ledger   — append-only ledger of every earn/redeem/expire/adjust
--
-- Idempotent.

-- ============================================================
-- 1. loyalty_settings — per-tenant
-- ============================================================
create table if not exists public.loyalty_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  is_enabled boolean not null default false,
  -- Earning rate: points per RON spent (defaults to 1 point per 5 RON).
  points_per_ron numeric(6,3) not null default 0.200
    check (points_per_ron >= 0 and points_per_ron <= 100),
  -- Redemption rate: how many RON of discount you get per point.
  -- Default 0.10 RON per point => 50 points = 5 RON off.
  ron_per_point numeric(6,3) not null default 0.100
    check (ron_per_point >= 0 and ron_per_point <= 10),
  -- Threshold to redeem (anti-spam).
  min_points_to_redeem int not null default 50
    check (min_points_to_redeem >= 1),
  -- Max % of order total that can be paid with points (caps the discount).
  max_redemption_pct int not null default 30
    check (max_redemption_pct between 1 and 100),
  -- Inactive points expire after this many days (0 = never expire).
  expiry_days int not null default 365
    check (expiry_days >= 0),
  -- Welcome bonus on first order (0 = disabled).
  welcome_bonus_points int not null default 0
    check (welcome_bonus_points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loyalty_settings enable row level security;
drop policy if exists loyalty_settings_member_read on public.loyalty_settings;
create policy loyalty_settings_member_read on public.loyalty_settings
  for select to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = loyalty_settings.tenant_id
         and tm.user_id  = auth.uid()
    )
  );

-- ============================================================
-- 2. loyalty_accounts — per (tenant, customer)
-- ============================================================
create table if not exists public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  balance_points int not null default 0 check (balance_points >= 0),
  lifetime_earned_points int not null default 0 check (lifetime_earned_points >= 0),
  lifetime_redeemed_points int not null default 0 check (lifetime_redeemed_points >= 0),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, customer_id)
);

create index if not exists idx_loyalty_accounts_tenant_balance
  on public.loyalty_accounts (tenant_id, balance_points desc);

alter table public.loyalty_accounts enable row level security;
drop policy if exists loyalty_accounts_member_read on public.loyalty_accounts;
create policy loyalty_accounts_member_read on public.loyalty_accounts
  for select to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = loyalty_accounts.tenant_id
         and tm.user_id  = auth.uid()
    )
  );

-- ============================================================
-- 3. loyalty_ledger — append-only audit trail
-- ============================================================
create table if not exists public.loyalty_ledger (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid not null references public.loyalty_accounts(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  kind text not null check (kind in ('earned', 'redeemed', 'expired', 'adjusted', 'welcome_bonus')),
  points int not null,
  -- Reference to the originating event:
  --   for 'earned' / 'redeemed': order id
  --   for 'expired' / 'adjusted': null
  related_order_id uuid references public.restaurant_orders(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_loyalty_ledger_account_created
  on public.loyalty_ledger (account_id, created_at desc);
create index if not exists idx_loyalty_ledger_tenant_kind_created
  on public.loyalty_ledger (tenant_id, kind, created_at desc);

alter table public.loyalty_ledger enable row level security;
drop policy if exists loyalty_ledger_member_read on public.loyalty_ledger;
create policy loyalty_ledger_member_read on public.loyalty_ledger
  for select to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = loyalty_ledger.tenant_id
         and tm.user_id  = auth.uid()
    )
  );

-- ============================================================
-- 4. Atomic earn/redeem RPC (transaction-safe)
-- ============================================================
-- Earning is called server-side after an order is marked DELIVERED. Doing
-- it in a single SQL transaction prevents drift between balance + ledger.
create or replace function public.fn_loyalty_earn(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_order_id uuid,
  p_points int,
  p_note text default null
) returns int language plpgsql security definer as $$
declare
  v_account_id uuid;
  v_new_balance int;
begin
  if p_points <= 0 then
    return 0;
  end if;

  -- Upsert account
  insert into public.loyalty_accounts (tenant_id, customer_id, balance_points, lifetime_earned_points)
       values (p_tenant_id, p_customer_id, p_points, p_points)
       on conflict (tenant_id, customer_id) do update
       set balance_points = loyalty_accounts.balance_points + p_points,
           lifetime_earned_points = loyalty_accounts.lifetime_earned_points + p_points,
           last_activity_at = now()
       returning id, balance_points into v_account_id, v_new_balance;

  insert into public.loyalty_ledger (
    tenant_id, account_id, customer_id, kind, points, related_order_id, note
  ) values (
    p_tenant_id, v_account_id, p_customer_id, 'earned', p_points, p_order_id, p_note
  );

  return v_new_balance;
end$$;

-- Redeem: subtracts from balance + writes ledger row. Returns new balance,
-- or NULL if insufficient points (caller checks).
create or replace function public.fn_loyalty_redeem(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_order_id uuid,
  p_points int,
  p_note text default null
) returns int language plpgsql security definer as $$
declare
  v_account_id uuid;
  v_balance int;
begin
  if p_points <= 0 then
    return null;
  end if;

  select id, balance_points into v_account_id, v_balance
    from public.loyalty_accounts
   where tenant_id = p_tenant_id and customer_id = p_customer_id
   for update;

  if v_account_id is null or v_balance < p_points then
    return null;
  end if;

  update public.loyalty_accounts
     set balance_points = balance_points - p_points,
         lifetime_redeemed_points = lifetime_redeemed_points + p_points,
         last_activity_at = now()
   where id = v_account_id
   returning balance_points into v_balance;

  insert into public.loyalty_ledger (
    tenant_id, account_id, customer_id, kind, points, related_order_id, note
  ) values (
    p_tenant_id, v_account_id, p_customer_id, 'redeemed', -p_points, p_order_id, p_note
  );

  return v_balance;
end$$;

grant execute on function public.fn_loyalty_earn(uuid, uuid, uuid, int, text) to service_role;
grant execute on function public.fn_loyalty_redeem(uuid, uuid, uuid, int, text) to service_role;

-- ============================================================
-- 5. Audit log action keys (documented; no schema change)
-- ============================================================
-- New action keys used by the loyalty server actions:
--   loyalty.settings_updated
--   loyalty.points_earned
--   loyalty.points_redeemed
--   loyalty.points_adjusted   (manual operator override)
