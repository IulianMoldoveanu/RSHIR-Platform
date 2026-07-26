-- Live incident 2026-07-26/27: order #77001591 (a PICKUP order, no courier)
-- had a stray courier_orders row from before the PR #964 trigger fix
-- (sync_restaurant_to_courier_order now skips PICKUP orders entirely, but
-- this row predated that fix). Cancelling that stray courier_orders row to
-- clean it up triggered sync_courier_to_restaurant_status, which mapped
-- courier_orders.status='CANCELLED' -> restaurant_orders.status='CANCELLED'
-- and silently overwrote the just-corrected PICKED_UP status.
--
-- Root cause: this trigger has no fulfillment awareness at all -- it maps
-- ANY courier_orders status change onto restaurant_orders using courier
-- vocabulary (PICKED_UP/IN_TRANSIT/DELIVERED/CANCELLED), with no guard for
-- "this restaurant order is a PICKUP order that should never be touched by
-- courier-side status changes in the first place."
--
-- Fix: skip entirely when the linked restaurant_orders row has no
-- delivery_address_id (i.e. it's a PICKUP order) -- courier-side status on
-- a stray/legacy courier_orders row must never drive a PICKUP order's
-- status. Also guard against clobbering an already-terminal restaurant
-- status (PICKED_UP/NO_SHOW), matching the existing DELIVERED guard.

CREATE OR REPLACE FUNCTION public.sync_courier_to_restaurant_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_target text;
  v_is_pickup boolean;
begin
  if new.source_type <> 'HIR_TENANT' or new.source_tenant_id is null or new.source_order_id is null
     or new.status is not distinct from old.status then
    return new;
  end if;

  select (delivery_address_id is null) into v_is_pickup
    from public.restaurant_orders
   where id = new.source_order_id::uuid and tenant_id = new.source_tenant_id;

  -- No matching row, or the order is PICKUP (no courier leg by definition)
  -- -- courier-side status changes must never drive its restaurant status.
  if v_is_pickup is null or v_is_pickup then
    return new;
  end if;

  v_target := case new.status
    when 'PICKED_UP' then 'IN_DELIVERY'
    when 'IN_TRANSIT' then 'IN_DELIVERY'
    when 'DELIVERED' then 'DELIVERED'
    when 'CANCELLED' then 'CANCELLED'
    else null
  end;
  if v_target is null then return new; end if;

  update public.restaurant_orders
     set status = v_target, updated_at = now()
   where id = new.source_order_id::uuid
     and tenant_id = new.source_tenant_id
     and status <> v_target
     and status not in ('DELIVERED', 'PICKED_UP', 'NO_SHOW');

  if new.status = 'DELIVERED' then
    update public.restaurant_orders
       set payment_status = 'PAID', updated_at = now()
     where id = new.source_order_id::uuid
       and tenant_id = new.source_tenant_id
       and payment_method = 'COD'
       and payment_status = 'UNPAID';
  end if;

  return new;
end;
$function$;
