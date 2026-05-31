-- Polish P1 (BEAST audit SIMBIOZA #3): COD payment_status sync on DELIVERED
--
-- Problem
-- -------
-- When a courier marks a HIR_TENANT-sourced courier_orders row as DELIVERED,
-- the reverse-sync trigger (#20260526_002) mirrors `status='DELIVERED'` onto
-- restaurant_orders correctly — but does NOT touch `payment_status`. For
-- COD orders that means restaurant dashboard keeps showing UNPAID forever
-- even though cash was collected on doorstep.
--
-- Fix
-- ----
-- Extend the existing reverse trigger function so that the DELIVERED branch
-- ALSO flips restaurant_orders.payment_status from UNPAID → PAID for COD
-- orders. The check is intentionally narrow: only `payment_method='COD'`
-- AND only the precise transition out of UNPAID; CARD orders are gated by
-- the PSP webhook and must not be touched here.
--
-- Idempotency: the UPDATE WHERE payment_status='UNPAID' clause guarantees a
-- single one-shot flip, matching the pattern used elsewhere in bidi sync.

create or replace function public.sync_courier_to_restaurant_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target text;
begin
  if new.source_type <> 'HIR_TENANT'
     or new.source_tenant_id is null
     or new.source_order_id is null
     or new.status is not distinct from old.status then
    return new;
  end if;

  v_target := case new.status
    when 'PICKED_UP'  then 'IN_DELIVERY'
    when 'IN_TRANSIT' then 'IN_DELIVERY'
    when 'DELIVERED'  then 'DELIVERED'
    when 'CANCELLED'  then 'CANCELLED'
    else null
  end;

  if v_target is null then
    return new;
  end if;

  update public.restaurant_orders
     set status = v_target, updated_at = now()
   where id = new.source_order_id::uuid
     and tenant_id = new.source_tenant_id
     and status <> v_target
     -- Never walk backwards from DELIVERED.
     and status <> 'DELIVERED';

  -- BEAST P1 SIMBIOZA #3: on DELIVERED, also flip COD orders to PAID.
  -- Atomic one-shot (WHERE payment_status='UNPAID') so a retry / replay
  -- can't double-bill, and we never touch CARD orders (those are gated
  -- by the PSP webhook).
  if new.status = 'DELIVERED' then
    update public.restaurant_orders
       set payment_status = 'PAID',
           updated_at = now()
     where id = new.source_order_id::uuid
       and tenant_id = new.source_tenant_id
       and payment_method = 'COD'
       and payment_status = 'UNPAID';
  end if;

  return new;
end;
$$;

comment on function public.sync_courier_to_restaurant_status is
  'Wave 1.0 bidi sync + BEAST P1 polish: when courier_orders changes status '
  '(HIR_TENANT-sourced), mirrors to parent restaurant_orders so storefront / '
  'dashboard / track page see the live state without polling. Refuses to walk '
  'a DELIVERED order back. On DELIVERED additionally flips COD orders from '
  'UNPAID to PAID (atomic one-shot).';
