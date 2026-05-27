-- Wave 1.0 follow-up #2 — supply fleet_id when bidi-sync inserts into
-- courier_orders.
--
-- The previous trigger (20260620_003) had a NULL fleet_id, which now
-- violates the courier_orders.fleet_id NOT NULL constraint added by a
-- later migration. Effect: any restaurant_orders → DISPATCHED transition
-- raised "null value in column \"fleet_id\" violates not-null constraint"
-- and the UPDATE rolled back. Bidi-sync was effectively a no-op on prod.
--
-- Resolution policy (mirrors how /api/external/orders selects fleet for
-- HIR_TENANT-sourced inserts — see apps/restaurant-courier/src/lib/api-key.ts):
--   1. fleet_restaurant_assignments where status='ACTIVE' for this tenant
--      (newest assignment), or
--   2. fall back to the system owner fleet (courier_fleets.tier='owner').
-- If neither exists the trigger aborts the UPDATE with a clear message
-- so the operator sees the misconfiguration instead of a silent loss.
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
  v_fleet_id uuid;
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

    -- Fleet resolution: tenant assignment → owner fleet fallback.
    select fra.fleet_id into v_fleet_id
      from public.fleet_restaurant_assignments fra
      join public.courier_fleets cf on cf.id = fra.fleet_id
      where fra.restaurant_tenant_id = new.tenant_id
        and fra.status = 'ACTIVE'
        and cf.is_active = true
      order by fra.assigned_at desc nulls last
      limit 1;

    if v_fleet_id is null then
      select id into v_fleet_id
        from public.courier_fleets
        where tier = 'owner' and is_active = true
        order by created_at asc
        limit 1;
    end if;

    if v_fleet_id is null then
      raise exception 'bidi_sync_no_fleet_available for tenant %', new.tenant_id
        using hint = 'Assign fleet_restaurant_assignments row, or ensure a tier=owner active fleet exists.';
    end if;

    v_pickup := v_settings->'pickup_address';

    v_pickup_line1 := coalesce(
      case when jsonb_typeof(v_pickup) = 'object' then v_pickup->>'line1' end,
      case when jsonb_typeof(v_pickup) = 'string' then v_pickup #>> '{}' end,
      v_settings->>'physical_address',
      v_settings->'location'->>'formatted'
    );

    v_pickup_lat := coalesce(
      case when jsonb_typeof(v_pickup) = 'object'
        then nullif(v_pickup->>'lat','')::numeric end,
      nullif(v_settings->>'location_lat','')::numeric,
      nullif(v_settings->'location'->>'lat','')::numeric
    );
    v_pickup_lng := coalesce(
      case when jsonb_typeof(v_pickup) = 'object'
        then nullif(v_pickup->>'lng','')::numeric end,
      nullif(v_settings->>'location_lng','')::numeric,
      nullif(v_settings->'location'->>'lng','')::numeric
    );

    select first_name, phone into v_customer
      from public.customers where id = new.customer_id;

    select line1, latitude, longitude into v_address
      from public.customer_addresses where id = new.delivery_address_id;

    insert into public.courier_orders (
      fleet_id,
      source_type, source_tenant_id, source_order_id,
      customer_first_name, customer_phone,
      pickup_line1, pickup_lat, pickup_lng,
      dropoff_line1, dropoff_lat, dropoff_lng,
      items, total_ron, delivery_fee_ron,
      payment_method, status, public_track_token
    )
    values (
      v_fleet_id,
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
  'Wave 1.0 bidi sync (revised 2026-05-27 #2): resolves fleet_id via '
  'fleet_restaurant_assignments → owner-tier fleet fallback. Pickup '
  'cascade: settings.pickup_address (object|string) → physical_address → '
  'location.formatted. Lat/lng cascade: nested → flat location_lat/lng → '
  'settings.location (matches storefront tenant-location.ts).';
