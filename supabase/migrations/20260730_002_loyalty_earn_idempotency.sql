-- Fix: loyalty points could be double-credited for the same order.
--
-- updateOrderStatus() has no optimistic-concurrency guard on the status
-- UPDATE, so a double-click / retried request / racing tabs can call
-- awardLoyaltyForDeliveredOrder() twice for one order. fn_loyalty_earn had
-- no idempotency check of its own, so each call unconditionally added
-- p_points to the balance and appended a 'earned' ledger row.
--
-- Fix at the source of truth: a partial unique index prevents more than
-- one 'earned' ledger row per order, and fn_loyalty_earn checks for an
-- existing row first and no-ops (returns the current balance) instead of
-- crediting again. This closes the race regardless of how many times the
-- application calls the RPC.
--
-- Idempotent.

create unique index if not exists uq_loyalty_ledger_earned_per_order
  on public.loyalty_ledger (related_order_id)
  where kind = 'earned' and related_order_id is not null;

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

  -- Already earned for this order — no-op, return the current balance.
  if p_order_id is not null and exists (
    select 1 from public.loyalty_ledger
     where related_order_id = p_order_id and kind = 'earned'
  ) then
    select balance_points into v_new_balance
      from public.loyalty_accounts
     where tenant_id = p_tenant_id and customer_id = p_customer_id;
    return coalesce(v_new_balance, 0);
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
exception
  when unique_violation then
    -- Race lost against a concurrent earn for the same order — the other
    -- transaction won, so return the balance as it stands now.
    select balance_points into v_new_balance
      from public.loyalty_accounts
     where tenant_id = p_tenant_id and customer_id = p_customer_id;
    return coalesce(v_new_balance, 0);
end$$;
