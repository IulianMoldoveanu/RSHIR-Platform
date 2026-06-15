-- Restore fleet_id + city_id resolution to the restaurant→courier bidi trigger.
--
-- REGRESSION: 20260620_004 added fleet_id resolution (assignment → owner-tier
-- fallback) to sync_restaurant_to_courier_order(). But the later trigger
-- rewrites that added pickup_phone (028), pickup_name (029) and dropoff_notes
-- (030) each declared themselves a "faithful copy of the current prod
-- definition" and copied a pre-004 base — silently DROPPING the fleet_id
-- resolution AND the city_id stamp. Since courier_orders.fleet_id is NOT NULL,
-- EVERY restaurant_orders → DISPATCHED transition has been failing on prod with
-- "null value in column fleet_id violates not-null constraint" and rolling back
-- the UPDATE. Restaurant dispatch to the courier pool was effectively dead.
--
-- Verified 2026-06-15 with an end-to-end test (București tenant → ELS fleet):
-- before this fix the dispatch failed; after it the courier_order is created
-- with fleet_id = the assigned fleet and city_id = the tenant's city.
--
-- This version merges: 030's columns (pickup_phone/name, dropoff_notes) +
-- 004's fleet_id resolution + city_id stamp from tenants.city_id.

create or replace function public.sync_restaurant_to_courier_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_external_dispatch boolean;
  v_settings jsonb;
  v_city_id uuid;
  v_pickup jsonb;
  v_customer record;
  v_address record;
  v_already_exists uuid;
  v_fleet_id uuid;
begin
  if new.status = 'DISPATCHED' and (old.status is distinct from 'DISPATCHED') then
    select external_dispatch_enabled, settings, city_id
      into v_external_dispatch, v_settings, v_city_id
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

    -- Fleet resolution (restored from 20260620_004): active tenant assignment →
    -- owner-tier fleet fallback → raise so a misconfiguration is loud, not a
    -- silent NOT NULL crash. fleet_restaurant_assignments.status is lowercase.
    select fra.fleet_id into v_fleet_id
      from public.fleet_restaurant_assignments fra
      join public.courier_fleets cf on cf.id = fra.fleet_id
      where fra.restaurant_tenant_id = new.tenant_id
        and fra.status = 'active'
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
        using hint = 'Assign a fleet_restaurant_assignments row, or ensure a tier=owner active fleet exists.';
    end if;

    v_pickup := coalesce(v_settings->'pickup_address', '{}'::jsonb);

    select first_name, phone into v_customer
      from public.customers where id = new.customer_id;

    select line1, latitude, longitude into v_address
      from public.customer_addresses where id = new.delivery_address_id;

    insert into public.courier_orders (
      fleet_id, city_id,
      source_type, source_tenant_id, source_order_id,
      customer_first_name, customer_phone,
      pickup_line1, pickup_lat, pickup_lng, pickup_phone, pickup_name,
      dropoff_line1, dropoff_lat, dropoff_lng,
      items, total_ron, delivery_fee_ron,
      payment_method, status, public_track_token,
      dropoff_notes
    )
    values (
      v_fleet_id, v_city_id,
      'HIR_TENANT', new.tenant_id, new.id::text,
      v_customer.first_name, v_customer.phone,
      v_pickup->>'line1',
      nullif(v_pickup->>'lat','')::numeric,
      nullif(v_pickup->>'lng','')::numeric,
      nullif(v_pickup->>'phone',''),
      nullif(v_pickup->>'name',''),
      v_address.line1, v_address.latitude, v_address.longitude,
      new.items, new.total_ron, new.delivery_fee_ron,
      case when new.payment_status = 'PAID' then 'CARD' else 'COD' end,
      'CREATED',
      new.public_track_token::text,
      nullif(new.notes, '')
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
$function$;

comment on function public.sync_restaurant_to_courier_order is
  'Restaurant→courier bidi sync. Resolves fleet_id (assignment → owner fallback) '
  'and stamps city_id from the tenant, plus pickup_phone/name + dropoff_notes. '
  'Restores the fleet_id/city_id logic dropped by the 028/029/030 rewrites.';
