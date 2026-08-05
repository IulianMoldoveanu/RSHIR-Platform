-- Move courier_orders creation from DISPATCHED to PREPARING, and add a
-- restaurant-side "ready for pickup" gate mirroring the pharma_ready_at
-- pattern already live for the pharmacy vertical.
--
-- Applied and verified live on prod (qfmeojeipncuxeltnvab) before landing
-- this file: created a test order, advanced PENDING -> PREPARING, confirmed
-- courier_orders was created immediately (not at DISPATCHED); advanced to
-- READY, confirmed restaurant_ready_at was stamped.
--
-- Why: dispatcher needs to see + allocate orders as soon as the restaurant
-- accepts them, not only once "Trimite" is clicked at the end of the prep
-- cycle. The rider can accept early (heading toward the restaurant) but is
-- blocked from marking PICKED_UP until the kitchen actually marks the order
-- READY — enforced in markPickedUpAction's query filter, not just the UI.
--
-- Also fixes a pre-existing bug in the same function: payment_method on the
-- inserted courier_orders row was derived from payment_status ('PAID' ->
-- 'CARD', else 'COD'), which mislabels an unpaid-but-legitimate COD order
-- correctly but would also mislabel a CARD order that hasn't captured yet.
-- Now reads restaurant_orders.payment_method directly.

alter table public.courier_orders add column if not exists restaurant_ready_at timestamptz;

CREATE OR REPLACE FUNCTION public.sync_restaurant_to_courier_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_external_dispatch boolean;
  v_settings jsonb;
  v_city_id uuid;
  v_pickup jsonb;
  v_customer record;
  v_address record;
  v_already_exists uuid;
  v_fleet_id uuid;
  v_pickup_line1 text;
  v_pickup_lat numeric;
  v_pickup_lng numeric;
  v_pickup_phone text;
  v_pickup_name text;
begin
  -- Create the courier_orders row as soon as the restaurant accepts the
  -- order (PENDING -> PREPARING), not at DISPATCHED. This lets a dispatcher
  -- allocate a rider while the kitchen is still cooking; the rider can
  -- accept early but is blocked from PICKED_UP until restaurant_ready_at is
  -- stamped (see the READY branch below and markPickedUpAction's pickup gate).
  if new.status = 'PREPARING' and (old.status is distinct from 'PREPARING') then
    select external_dispatch_enabled, settings, city_id into v_external_dispatch, v_settings, v_city_id
      from public.tenants where id = new.tenant_id;
    if v_external_dispatch is true then return new; end if;

    select id into v_already_exists from public.courier_orders
      where source_type='HIR_TENANT' and source_tenant_id=new.tenant_id and source_order_id=new.id::text limit 1;
    if v_already_exists is not null then return new; end if;

    select fra.fleet_id into v_fleet_id
      from public.fleet_restaurant_assignments fra
      join public.courier_fleets cf on cf.id = fra.fleet_id
      where fra.restaurant_tenant_id=new.tenant_id and fra.status='active' and cf.is_active=true
      order by fra.assigned_at desc nulls last limit 1;
    if v_fleet_id is null then
      select id into v_fleet_id from public.courier_fleets where tier='owner' and is_active=true order by created_at asc limit 1;
    end if;
    if v_fleet_id is null then
      raise exception 'bidi_sync_no_fleet_available for tenant %', new.tenant_id
        using hint='Assign a fleet_restaurant_assignments row, or ensure a tier=owner active fleet exists.';
    end if;

    v_pickup := v_settings->'pickup_address';
    if jsonb_typeof(v_pickup) = 'object' then
      v_pickup_line1 := v_pickup->>'line1';
      v_pickup_lat := nullif(v_pickup->>'lat','')::numeric;
      v_pickup_lng := nullif(v_pickup->>'lng','')::numeric;
      v_pickup_phone := nullif(v_pickup->>'phone','');
      v_pickup_name := nullif(v_pickup->>'name','');
    elsif jsonb_typeof(v_pickup) = 'string' then
      v_pickup_line1 := nullif(v_pickup #>> '{}', '');
      v_pickup_lat := nullif(v_settings->'location'->>'lat','')::numeric;
      v_pickup_lng := nullif(v_settings->'location'->>'lng','')::numeric;
      v_pickup_phone := nullif(v_settings->>'pickup_phone','');
      v_pickup_name := nullif(v_settings->>'pickup_name','');
    else
      v_pickup_line1 := null; v_pickup_lat := null; v_pickup_lng := null; v_pickup_phone := null; v_pickup_name := null;
    end if;

    select first_name, phone into v_customer from public.customers where id=new.customer_id;
    select line1, latitude, longitude into v_address from public.customer_addresses where id=new.delivery_address_id;

    insert into public.courier_orders (
      fleet_id, city_id, source_type, source_tenant_id, source_order_id,
      customer_first_name, customer_phone, pickup_line1, pickup_lat, pickup_lng,
      pickup_phone, pickup_name, dropoff_line1, dropoff_lat, dropoff_lng,
      items, total_ron, delivery_fee_ron, payment_method, status,
      public_track_token, dropoff_notes
    ) values (
      v_fleet_id, v_city_id, 'HIR_TENANT', new.tenant_id, new.id::text,
      v_customer.first_name, v_customer.phone, v_pickup_line1, v_pickup_lat, v_pickup_lng,
      v_pickup_phone, v_pickup_name, v_address.line1, v_address.latitude, v_address.longitude,
      new.items, new.total_ron, new.delivery_fee_ron,
      case when new.payment_method = 'COD' then 'COD' else 'CARD' end,
      'CREATED', new.public_track_token::text, nullif(new.notes,'')
    );
    return new;
  end if;

  -- Kitchen marks the order READY: stamp restaurant_ready_at on the linked
  -- courier_orders row so the rider's pickup swipe unblocks (mirrors the
  -- pharma_ready_at gate markPickedUpAction already uses for pharmacy orders).
  if new.status = 'READY' and (old.status is distinct from 'READY') then
    update public.courier_orders
      set restaurant_ready_at = now(), updated_at = now()
      where source_type='HIR_TENANT' and source_tenant_id=new.tenant_id and source_order_id=new.id::text
        and restaurant_ready_at is null;
    return new;
  end if;

  if new.status='CANCELLED' and (old.status is distinct from 'CANCELLED') then
    update public.courier_orders set status='CANCELLED', updated_at=now()
      where source_type='HIR_TENANT' and source_tenant_id=new.tenant_id and source_order_id=new.id::text
        and status<>'CANCELLED' and status<>'DELIVERED';
  end if;

  return new;
end;
$function$;
