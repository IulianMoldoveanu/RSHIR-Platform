-- Multi-city foundation (MC1): stamp city (and reserve zone) on courier_orders.
--
-- Today courier_orders has pickup/dropoff coords + fleet_id but no notion of
-- WHICH CITY a delivery belongs to — the backbone for city-scoped allocation,
-- dashboards, and (later) zone routing. A vendor belongs to exactly one city
-- (tenants.city_id, seeded by 20260506_011), so the order's city is the source
-- tenant's city. This is robust and needs no polygon math.
--
-- zone_id / zone_type are added but RESERVED (nullable, no FK) — intra-city zone
-- resolution (fleet_zones / pricing_zones point-in-polygon) is a later increment,
-- mirroring the reserved platform_order_events.zone_id / demand_signals.zone_id.
-- Adding the columns now also stops combo-engine / display from selecting a
-- non-existent column.
--
-- Additive + nullable: zero behavior change for existing rows.

alter table public.courier_orders
  add column if not exists city_id uuid references public.cities(id) on delete set null;
alter table public.courier_orders
  add column if not exists zone_id uuid;
alter table public.courier_orders
  add column if not exists zone_type text;

create index if not exists idx_courier_orders_city
  on public.courier_orders (city_id) where city_id is not null;

comment on column public.courier_orders.city_id is
  'Multi-city: the city this delivery belongs to, derived from the source tenant '
  '(tenants.city_id) on dispatch. Backbone for city-scoped allocation + dashboards.';
comment on column public.courier_orders.zone_id is
  'Multi-city: RESERVED — intra-city zone (fleet_zones / pricing_zones), populated '
  'once polygon resolution is wired.';
comment on column public.courier_orders.zone_type is
  'Multi-city: RESERVED — URBAN | EXTRA_URBAN, populated with zone_id.';

-- Backfill existing HIR_TENANT orders from their source tenant's city.
update public.courier_orders co
   set city_id = t.city_id
  from public.tenants t
 where co.source_tenant_id = t.id
   and co.city_id is null
   and t.city_id is not null;

-- Extend the bidi-sync trigger to also stamp city_id on dispatch. Body is
-- otherwise identical to 20260620_004 — only v_city_id is resolved and inserted.
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
  v_city_id uuid;
begin
  if new.status = 'DISPATCHED' and (old.status is distinct from 'DISPATCHED') then
    select external_dispatch_enabled, settings, city_id
      into v_external_dispatch, v_settings, v_city_id
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
    -- Note: fleet_restaurant_assignments.status is lowercase
    -- ('active' / 'paused' / 'terminated' per CHECK constraint).
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
      fleet_id, city_id,
      source_type, source_tenant_id, source_order_id,
      customer_first_name, customer_phone,
      pickup_line1, pickup_lat, pickup_lng,
      dropoff_line1, dropoff_lat, dropoff_lng,
      items, total_ron, delivery_fee_ron,
      payment_method, status, public_track_token
    )
    values (
      v_fleet_id, v_city_id,
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
  'Wave 1.0 bidi sync (revised 2026-06-01, MC1): resolves fleet_id via '
  'fleet_restaurant_assignments → owner-tier fleet fallback, and stamps city_id '
  'from the source tenant. Pickup cascade: settings.pickup_address (object|string) '
  '→ physical_address → location.formatted.';
