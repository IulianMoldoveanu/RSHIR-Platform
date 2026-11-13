-- ============================================================================
-- The fallback ladder could not see the city, and counted riders who are not
-- allowed to ride.
--
-- Found on the Bucharest bench, 2026-09-09. Two defects in
-- sync_restaurant_to_courier_order's fleet resolution, both invisible until a
-- second city exists — which is exactly what Bucharest is.
--
-- 1. THE LADDER IS BLIND TO THE CITY. With no explicit assignment the trigger
--    falls back to `tier='owner'`, and nothing else. In production the only
--    owner fleet is HIR Default Fleet: no city, zero riders. So an order placed
--    in Bucharest is handed to a fleet that has nobody in any city, while Els
--    courier delivery srl — active, KYF verified, staffed, and actually in
--    Bucharest — is never considered. Measured on the bench: an unassigned
--    Bucharest order landed on "HIR Default Fleet (city=none, 0 active riders)".
--
-- 2. "HAS RIDERS" IS NOT "CAN RIDE". Step 2 counted couriers with
--    status='ACTIVE'. The dispatch sweep additionally requires
--    courier_can_take_orders() — the fleet's own KYC/KYF gate. A fleet whose
--    riders are all ACTIVE but unverified therefore reads as staffed here and
--    is provably unable to receive a single offer. The fallback would pick it,
--    the sweep would skip it, and the order would sit in CREATED for ever.
--    Els requires KYC, so this is one unverified rider away from live.
--
-- The fix inserts a city step above the owner steps and makes every
-- staffing test mean the same thing the sweep means. Nothing that routes
-- correctly today changes: the explicit assignment still wins first, and both
-- owner-tier fallbacks stay exactly where they were, so a tenant with no city
-- (or a city with no staffed fleet) follows the old path unchanged.
-- ============================================================================

create or replace function public.sync_restaurant_to_courier_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_external_dispatch boolean;
  v_settings          jsonb;
  v_city_id           uuid;
  v_already_exists    uuid;
  v_fleet_id          uuid;
  v_pickup            jsonb;
  v_pickup_line1      text;
  v_pickup_lat        numeric;
  v_pickup_lng        numeric;
  v_pickup_phone      text;
  v_pickup_name       text;
  v_customer          record;
  v_address           record;
begin
  if new.status = 'PREPARING' and (old.status is distinct from 'PREPARING')
     and new.delivery_address_id is not null then
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

    -- Bucharest bench finding 1: a fleet in the order's own city, with someone
    -- who is actually allowed to ride, beats a national fallback that has
    -- nobody. Only fires when such a fleet exists, so a tenant with no city
    -- keeps the old behaviour exactly.
    if v_fleet_id is null and v_city_id is not null then
      select f.id into v_fleet_id
        from public.courier_fleets f
       where f.is_active = true
         and f.primary_city_id = v_city_id
         and exists (
           select 1 from public.courier_profiles cp
            where cp.fleet_id = f.id and cp.status = 'ACTIVE'
              and public.courier_can_take_orders(cp.user_id)
         )
       order by (f.tier = 'owner') desc, f.created_at asc limit 1;
    end if;

    -- Load-test finding 1 (2026-08-10): prefer an owner fleet that has riders.
    -- An unstaffed fallback silently produces an order no courier can ever be
    -- offered. Bucharest bench finding 2: "has riders" now means the same thing
    -- fn_auto_dispatch_sweep means, KYC gate included.
    if v_fleet_id is null then
      select f.id into v_fleet_id
        from public.courier_fleets f
       where f.tier='owner' and f.is_active = true
         and exists (
           select 1 from public.courier_profiles cp
            where cp.fleet_id = f.id and cp.status = 'ACTIVE'
              and public.courier_can_take_orders(cp.user_id)
         )
       order by f.created_at asc limit 1;
    end if;
    -- Unchanged last resort, so nothing that works today starts failing.
    if v_fleet_id is null then
      select id into v_fleet_id from public.courier_fleets
       where tier='owner' and is_active=true order by created_at asc limit 1;
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
      v_pickup_lat := coalesce(
        nullif(v_settings->>'location_lat','')::numeric,
        nullif(v_settings->'location'->>'lat','')::numeric
      );
      v_pickup_lng := coalesce(
        nullif(v_settings->>'location_lng','')::numeric,
        nullif(v_settings->'location'->>'lng','')::numeric
      );
      v_pickup_phone := coalesce(
        nullif(v_settings->>'pickup_phone',''),
        nullif(v_settings->>'whatsapp_phone','')
      );
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
        and status <> 'CANCELLED' and status <> 'DELIVERED';
    return new;
  end if;

  return new;
end;
$function$;
