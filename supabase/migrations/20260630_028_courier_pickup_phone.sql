-- Optional vendor (pickup) contact phone on the shared courier pool.
--
-- The courier needs a way to reach the vendor (pharmacy / restaurant) to check
-- status or in an emergency while heading to the pickup. We surface an OPTIONAL
-- "Sună vendorul" button on the active-order card when this is populated.
--
-- Population (both verticals, additive — never required):
--   - pharma:     courier-mirror-pharma stores order.pickup.contact_phone
--                 (the pharmacy phone the mirror now sends).
--   - restaurant: the forward bidi-sync trigger copies it from
--                 tenants.settings.pickup_address->>'phone' (free-form JSON).
alter table public.courier_orders
  add column if not exists pickup_phone text;

comment on column public.courier_orders.pickup_phone is
  'Optional vendor (pickup) contact phone — pharmacy/restaurant. Surfaced as an optional "call the vendor" action on the active-order card. NULL when unknown.';

-- Recreate the restaurant→courier forward sync to also carry pickup_phone.
-- Faithful copy of 20260526_002 with the single additive column; logic is
-- otherwise unchanged (DISPATCHED-edge insert + CANCELLED propagation).
create or replace function public.sync_restaurant_to_courier_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_external_dispatch boolean;
  v_settings jsonb;
  v_pickup jsonb;
  v_customer record;
  v_address record;
  v_already_exists uuid;
begin
  -- DISPATCHED transition only, plus the CANCELLED case below.
  if new.status = 'DISPATCHED' and (old.status is distinct from 'DISPATCHED') then
    -- Skip external-dispatch tenants — the Fleet Manager webhook handles those.
    select external_dispatch_enabled, settings
      into v_external_dispatch, v_settings
      from public.tenants where id = new.tenant_id;
    if v_external_dispatch is true then
      return new;
    end if;

    -- Idempotency: don't double-insert on retry / duplicate trigger.
    select id into v_already_exists
      from public.courier_orders
      where source_type = 'HIR_TENANT'
        and source_tenant_id = new.tenant_id
        and source_order_id = new.id::text
      limit 1;
    if v_already_exists is not null then
      return new;
    end if;

    -- Pickup from tenants.settings.pickup_address (free-form JSON; tolerated
    -- if keys are missing).
    v_pickup := coalesce(v_settings->'pickup_address', '{}'::jsonb);

    select first_name, phone into v_customer
      from public.customers where id = new.customer_id;

    select line1, latitude, longitude into v_address
      from public.customer_addresses where id = new.delivery_address_id;

    insert into public.courier_orders (
      source_type, source_tenant_id, source_order_id,
      customer_first_name, customer_phone,
      pickup_line1, pickup_lat, pickup_lng, pickup_phone,
      dropoff_line1, dropoff_lat, dropoff_lng,
      items, total_ron, delivery_fee_ron,
      payment_method, status, public_track_token
    )
    values (
      'HIR_TENANT', new.tenant_id, new.id::text,
      v_customer.first_name, v_customer.phone,
      v_pickup->>'line1',
      nullif(v_pickup->>'lat','')::numeric,
      nullif(v_pickup->>'lng','')::numeric,
      nullif(v_pickup->>'phone',''),
      v_address.line1, v_address.latitude, v_address.longitude,
      new.items, new.total_ron, new.delivery_fee_ron,
      case when new.payment_status = 'PAID' then 'CARD' else 'COD' end,
      'CREATED',
      new.public_track_token::text
    );

    return new;
  end if;

  -- Cancel propagation: restaurant cancels → cancel courier_orders too.
  if new.status = 'CANCELLED' and (old.status is distinct from 'CANCELLED') then
    update public.courier_orders
       set status = 'CANCELLED', updated_at = now()
     where source_type = 'HIR_TENANT'
       and source_tenant_id = new.tenant_id
       and source_order_id = new.id::text
       and status <> 'CANCELLED'
       and status <> 'DELIVERED';
  end if;

  return new;
end;
$$;
