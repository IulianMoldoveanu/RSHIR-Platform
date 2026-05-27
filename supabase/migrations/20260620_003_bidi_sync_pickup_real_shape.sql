-- Wave 1.0 follow-up — match bidi-sync trigger to the real `tenants.settings`
-- shape produced by `saveOperationsAction`
-- (apps/restaurant-admin/src/app/dashboard/settings/operations/actions.ts).
--
-- The original trigger (20260526_002) read pickup data as a nested object:
--   settings.pickup_address = { line1, lat, lng }
-- but operations UI saves:
--   settings.pickup_address = "Strada ... Brașov" (free-form string)
--   settings.location       = { lat: <number>, lng: <number> }
--   settings.physical_address = "Strada ... Brașov" (free-form, legacy)
--
-- Result: every courier_orders row produced by Wave-1 had NULL pickup_line1,
-- pickup_lat, pickup_lng — couriers wouldn't know where to pick up.
-- Discovered 2026-05-27 while seeding the first bidi-sync e2e test on prod;
-- no rows had been produced yet so no historical cleanup is needed.
--
-- This migration replaces only the FORWARD function. The reverse function
-- (sync_courier_to_restaurant_status) is untouched.

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
  v_pickup_line1 text;
  v_pickup_lat numeric;
  v_pickup_lng numeric;
  v_customer record;
  v_address record;
  v_already_exists uuid;
begin
  if new.status = 'DISPATCHED' and (old.status is distinct from 'DISPATCHED') then
    select external_dispatch_enabled, settings
      into v_external_dispatch, v_settings
      from public.tenants where id = new.tenant_id;
    if v_external_dispatch is true then
      return new;
    end if;

    select id into v_already_exists
      from public.courier_orders
      where source_type = 'HIR_TENANT'
        and source_tenant_id = new.tenant_id
        and source_order_id = new.id::text
      limit 1;
    if v_already_exists is not null then
      return new;
    end if;

    v_pickup := v_settings->'pickup_address';

    -- line1: nested object first (forward-compat), then plain string,
    -- then legacy `physical_address`, then `location.formatted`.
    v_pickup_line1 := coalesce(
      case when jsonb_typeof(v_pickup) = 'object' then v_pickup->>'line1' end,
      case when jsonb_typeof(v_pickup) = 'string' then v_pickup #>> '{}' end,
      v_settings->>'physical_address',
      v_settings->'location'->>'formatted'
    );

    -- lat/lng: nested object first, then top-level `location.{lat,lng}`.
    v_pickup_lat := coalesce(
      case when jsonb_typeof(v_pickup) = 'object'
        then nullif(v_pickup->>'lat','')::numeric end,
      nullif(v_settings->'location'->>'lat','')::numeric
    );
    v_pickup_lng := coalesce(
      case when jsonb_typeof(v_pickup) = 'object'
        then nullif(v_pickup->>'lng','')::numeric end,
      nullif(v_settings->'location'->>'lng','')::numeric
    );

    select first_name, phone into v_customer
      from public.customers where id = new.customer_id;

    select line1, latitude, longitude into v_address
      from public.customer_addresses where id = new.delivery_address_id;

    insert into public.courier_orders (
      source_type, source_tenant_id, source_order_id,
      customer_first_name, customer_phone,
      pickup_line1, pickup_lat, pickup_lng,
      dropoff_line1, dropoff_lat, dropoff_lng,
      items, total_ron, delivery_fee_ron,
      payment_method, status, public_track_token
    )
    values (
      'HIR_TENANT', new.tenant_id, new.id::text,
      v_customer.first_name, v_customer.phone,
      v_pickup_line1, v_pickup_lat, v_pickup_lng,
      v_address.line1, v_address.latitude, v_address.longitude,
      new.items, new.total_ron, new.delivery_fee_ron,
      case when new.payment_status = 'PAID' then 'CARD' else 'COD' end,
      'CREATED',
      new.public_track_token::text
    );

    return new;
  end if;

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

comment on function public.sync_restaurant_to_courier_order is
  'Wave 1.0 bidi sync (revised 2026-05-27 to match real settings shape): '
  'on restaurant_orders DISPATCHED edge auto-inserts a courier_orders row. '
  'Reads pickup line1 from settings.pickup_address (object or string) with '
  'fallback to settings.physical_address / settings.location.formatted; '
  'reads lat/lng from settings.pickup_address (if object) or settings.location.';
