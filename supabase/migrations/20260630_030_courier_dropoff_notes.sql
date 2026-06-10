-- 20260630_030_courier_dropoff_notes
-- Delivery instructions for the courier ("urci scările, a 3-a poartă pe dreapta").
-- Customer-entered free text on restaurant_orders.notes (restaurant) + pharma
-- order.dropoff.notes (pharma mirror). Surfaced into the shared pool so the
-- courier app shows it. Additive + nullable — zero impact on existing rows.

alter table public.courier_orders add column if not exists dropoff_notes text;

-- Recreate the restaurant→courier bidi trigger to copy restaurant_orders.notes
-- → courier_orders.dropoff_notes. Faithful copy of the current prod definition
-- (incl. pickup_phone + pickup_name from 028/029); only dropoff_notes is added.
create or replace function public.sync_restaurant_to_courier_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      pickup_line1, pickup_lat, pickup_lng, pickup_phone, pickup_name,
      dropoff_line1, dropoff_lat, dropoff_lng,
      items, total_ron, delivery_fee_ron,
      payment_method, status, public_track_token,
      dropoff_notes
    )
    values (
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
$function$;
