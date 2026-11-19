-- 2026-11-19 - The pickup point stopped depending on the shape of a
-- neighbouring key.
--
-- `sync_restaurant_to_courier_order` is the trigger that turns a restaurant
-- order moving into PREPARING into a `courier_orders` row. It resolved the
-- pickup line1 / lat / lng inside a branch on
-- `jsonb_typeof(settings->'pickup_address')`:
--
--   object  -> read lat/lng from inside that object
--   string  -> read them from settings.location_lat / settings.location
--   neither -> set them to NULL
--
-- Only the Operations settings page ever writes `pickup_address`, and only
-- when the operator fills in the self-pickup address. The onboarding wizard
-- writes `location`, `location_lat` and `location_lng` and never touches
-- `pickup_address` -- so a restaurant that finished onboarding and set its
-- map pin, but never typed a self-pickup address, hit the third branch. The
-- courier order was created with pickup_lat = pickup_lng = NULL: the rider
-- got no pin to drive to and the per-km payout had no origin to measure
-- from. No error, no log line.
--
-- Every current tenant with coordinates happens to have a string in
-- `pickup_address`, so nothing in production is mis-dispatching today. The
-- next restaurant onboarded would have been the first to hit it.
--
-- This rewrite changes ONLY that block, field by field, each with its own
-- coalesce chain. The body below is `pg_get_functiondef` of the LIVE
-- function (151 lines, matching 20260909_004) with the block swapped -- the
-- fleet ladder, the city step and the CANCELLED branch are byte-identical,
-- because rebuilding this function from a migration file has already
-- deleted live guards three times.

CREATE OR REPLACE FUNCTION public.sync_restaurant_to_courier_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    --
    -- Codex P1 (#1075): only fleets that dispatch through the HIR app. An
    -- `external` fleet runs its own dispatcher and nothing forwards this row to
    -- it, so choosing one implicitly would strand the order in silence. An
    -- explicit assignment to an external fleet is an admin decision and is
    -- still honoured above.
    if v_fleet_id is null and v_city_id is not null then
      select f.id into v_fleet_id
        from public.courier_fleets f
       where f.is_active = true
         and f.primary_city_id = v_city_id
         and f.delivery_app = 'hir'
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

    -- 2026-11-19: each pickup field gets its own cascade. Before, the shape
    -- of `settings.pickup_address` decided whether the coordinates were read
    -- at all: only a *string* there unlocked the location keys, and a tenant
    -- without that key fell through to the else branch, which set the pickup
    -- point to NULL. The onboarding wizard writes `location`/`location_lat`
    -- and never writes `pickup_address`, so every restaurant onboarded that
    -- way produced courier orders with no origin -- no pin for the rider and
    -- no distance to price the delivery on, with nothing raising an error.
    v_pickup := v_settings->'pickup_address';

    v_pickup_line1 := coalesce(
      case jsonb_typeof(v_pickup)
        when 'object' then nullif(v_pickup->>'line1','')
        when 'string' then nullif(v_pickup #>> '{}', '')
      end,
      -- The street the wizard collected, if pickup_address was never set.
      nullif(v_settings->>'address','')
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

    v_pickup_phone := coalesce(
      case when jsonb_typeof(v_pickup) = 'object'
        then nullif(v_pickup->>'phone','') end,
      nullif(v_settings->>'pickup_phone',''),
      nullif(v_settings->>'whatsapp_phone','')
    );
    v_pickup_name := coalesce(
      case when jsonb_typeof(v_pickup) = 'object'
        then nullif(v_pickup->>'name','') end,
      nullif(v_settings->>'pickup_name','')
    );

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

comment on function public.sync_restaurant_to_courier_order() is
  'Mirrors a restaurant order into courier_orders at PREPARING. Pickup line1 '
  'and lat/lng each resolve independently: pickup_address (object or string) '
  'then settings.address, and pickup_address.lat/lng then flat location_lat/lng '
  'then nested location.lat/lng. Resolution no longer depends on which shape '
  'pickup_address happens to have (2026-11-19).';
