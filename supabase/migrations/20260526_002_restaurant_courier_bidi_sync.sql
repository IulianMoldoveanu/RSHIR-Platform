-- Wave 1.0 — Bidirectional sync between restaurant_orders and courier_orders.
--
-- Closes the gap noted in apps/restaurant-admin/src/lib/external-dispatch.ts:
--   "in the current schema, nothing auto-inserts into courier_orders for
--    restaurant orders, so the 'skip' is implicit"
--
-- Now: when a restaurant_orders row transitions to DISPATCHED AND the tenant
-- has external_dispatch_enabled = false (i.e. uses the HIR fleet, not a
-- third-party fleet manager), a courier_orders row is auto-created with
-- source_type='HIR_TENANT', source_tenant_id and source_order_id wired up
-- for back-reference.
--
-- And: when the courier_orders row's status changes (PICKED_UP / IN_TRANSIT
-- / DELIVERED / CANCELLED), the trigger writes the equivalent state back to
-- the parent restaurant_orders row so the storefront, customer track page
-- and tenant dashboard all see live progress without polling.
--
-- Loop safety: forward fires only on the PENDING/CONFIRMED/... → DISPATCHED
-- edge; reverse target statuses (IN_DELIVERY/DELIVERED/CANCELLED) cannot
-- re-trigger forward (it gates on NEW.status='DISPATCHED').
--
-- Idempotency: forward inserts only if no courier_orders row exists with
-- (source_type='HIR_TENANT', source_tenant_id, source_order_id). Safe on
-- duplicate triggers, retries, or migration re-runs.

-- ── 1. Forward: restaurant_orders → courier_orders ────────────────────

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
      pickup_line1, pickup_lat, pickup_lng,
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

drop trigger if exists trg_restaurant_to_courier_sync on public.restaurant_orders;
create trigger trg_restaurant_to_courier_sync
  after update of status on public.restaurant_orders
  for each row execute function public.sync_restaurant_to_courier_order();

-- ── 2. Reverse: courier_orders.status → restaurant_orders.status ──────

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

  return new;
end;
$$;

drop trigger if exists trg_courier_to_restaurant_sync on public.courier_orders;
create trigger trg_courier_to_restaurant_sync
  after update of status on public.courier_orders
  for each row execute function public.sync_courier_to_restaurant_status();

-- ── 3. Observability comment for /api/healthz visibility ──────────────

comment on function public.sync_restaurant_to_courier_order is
  'Wave 1.0 bidi sync: on restaurant_orders DISPATCHED edge auto-inserts a '
  'courier_orders row (source_type=HIR_TENANT) so HIR couriers see the order. '
  'Skips tenants with external_dispatch_enabled=true (Fleet Manager handles).';

comment on function public.sync_courier_to_restaurant_status is
  'Wave 1.0 bidi sync: when courier_orders changes status (HIR_TENANT-sourced), '
  'mirrors to parent restaurant_orders so storefront / dashboard / track page '
  'see the live state without polling. Refuses to walk a DELIVERED order back.';
