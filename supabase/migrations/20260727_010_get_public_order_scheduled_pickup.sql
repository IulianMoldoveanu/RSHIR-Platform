-- Adds scheduled_pickup_at to get_public_order's return payload. The column
-- was added to restaurant_orders in 20260727_004 (customer picks a same-day
-- pickup slot at checkout) but the public track RPC never picked it up, so
-- a customer who chose a specific pickup time had no way to see their
-- chosen time confirmed anywhere on /track/[token].
--
-- Pure additive change — every other field, redaction rule, and PII
-- boundary from 20260506_008 is preserved verbatim.

create or replace function public.get_public_order(p_token uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_order_id          uuid;
  v_status            text;
  v_payment_status    text;
  v_payment_method    text;
  v_items             jsonb;
  v_subtotal_ron      numeric;
  v_delivery_fee_ron  numeric;
  v_total_ron         numeric;
  v_created_at        timestamptz;
  v_updated_at        timestamptz;
  v_public_token      uuid;
  v_delivery_addr_id  uuid;
  v_tenant_id         uuid;
  v_customer_id       uuid;
  v_scheduled_pickup  timestamptz;

  v_tenant_name       text;
  v_tenant_slug       text;
  v_tenant_settings   jsonb;
  v_tenant_settings_safe jsonb;

  v_cust_first        text;
  v_cust_last         text;
  v_cust_last_initial text;

  v_addr_line1        text;
  v_addr_city         text;
  v_addr_neighborhood text;

  v_has_review        boolean := false;
begin
  if p_token is null then
    return null;
  end if;

  select
    o.id, o.status, o.payment_status, o.payment_method, o.items,
    o.subtotal_ron, o.delivery_fee_ron, o.total_ron, o.created_at,
    o.updated_at, o.public_track_token, o.delivery_address_id,
    o.tenant_id, o.customer_id, o.scheduled_pickup_at
  into
    v_order_id, v_status, v_payment_status, v_payment_method, v_items,
    v_subtotal_ron, v_delivery_fee_ron, v_total_ron, v_created_at,
    v_updated_at, v_public_token, v_delivery_addr_id, v_tenant_id,
    v_customer_id, v_scheduled_pickup
  from public.restaurant_orders o
  where o.public_track_token = p_token
  limit 1;

  if v_order_id is null then
    return null;
  end if;

  select t.name, t.slug, t.settings
  into v_tenant_name, v_tenant_slug, v_tenant_settings
  from public.tenants t
  where t.id = v_tenant_id;

  -- Whitelist tenant settings keys safe to expose on the public track page.
  -- Anything internal (stripe ids, integration tokens, internal notes,
  -- onboarding state) stays server-side.
  v_tenant_settings_safe := jsonb_build_object(
    'phone', coalesce(v_tenant_settings->'phone', 'null'::jsonb),
    'whatsapp_phone', coalesce(v_tenant_settings->'whatsapp_phone', 'null'::jsonb),
    'location_lat', coalesce(v_tenant_settings->'location_lat', 'null'::jsonb),
    'location_lng', coalesce(v_tenant_settings->'location_lng', 'null'::jsonb),
    'pickup_address', coalesce(v_tenant_settings->'pickup_address', 'null'::jsonb),
    'pickup_eta_minutes', coalesce(v_tenant_settings->'pickup_eta_minutes', 'null'::jsonb),
    'delivery_eta_min_minutes', coalesce(v_tenant_settings->'delivery_eta_min_minutes', 'null'::jsonb)
  );

  if v_customer_id is not null then
    select c.first_name, c.last_name
    into v_cust_first, v_cust_last
    from public.customers c
    where c.id = v_customer_id;

    if v_cust_last is not null and length(btrim(v_cust_last)) > 0 then
      v_cust_last_initial := upper(substring(btrim(v_cust_last) from 1 for 1)) || '.';
    end if;
  end if;

  if v_delivery_addr_id is not null then
    select a.line1, a.city
    into v_addr_line1, v_addr_city
    from public.customer_addresses a
    where a.id = v_delivery_addr_id;

    -- Neighborhood = everything before the first comma in line1.
    -- Falls back to city if line1 is empty.
    if v_addr_line1 is not null and length(btrim(v_addr_line1)) > 0 then
      v_addr_neighborhood := btrim(split_part(v_addr_line1, ',', 1));
    else
      v_addr_neighborhood := v_addr_city;
    end if;
  end if;

  if v_status = 'DELIVERED' then
    select exists (
      select 1 from public.restaurant_reviews where order_id = v_order_id
    ) into v_has_review;
  end if;

  return jsonb_build_object(
    'id', v_order_id,
    'status', v_status,
    'payment_status', v_payment_status,
    'payment_method', v_payment_method,
    'items', v_items,
    'subtotal_ron', v_subtotal_ron,
    'delivery_fee_ron', v_delivery_fee_ron,
    'total_ron', v_total_ron,
    'created_at', v_created_at,
    'updated_at', v_updated_at,
    'public_track_token', v_public_token,
    'fulfillment', case when v_delivery_addr_id is null then 'PICKUP' else 'DELIVERY' end,
    'scheduled_pickup_at', v_scheduled_pickup,
    'has_review', v_has_review,
    'tenant', case when v_tenant_name is null then null else jsonb_build_object(
      'name', v_tenant_name,
      'slug', v_tenant_slug,
      'settings', v_tenant_settings_safe
    ) end,
    'customer', case when v_cust_first is null and v_cust_last_initial is null then null
      else jsonb_build_object(
        'first_name', v_cust_first,
        'last_name_initial', v_cust_last_initial
      ) end,
    'dropoff', case when v_delivery_addr_id is null then null
      else jsonb_build_object(
        'neighborhood', coalesce(v_addr_neighborhood, ''),
        'city', v_addr_city
      ) end
  );
end;
$$;

revoke all on function public.get_public_order(uuid) from public;
grant execute on function public.get_public_order(uuid) to anon, authenticated;

comment on function public.get_public_order(uuid) is
  'Public track-page RPC. Redacts customer PII to first name + last-name initial and address to neighborhood + city. Adds scheduled_pickup_at (2026-07-27) for same-day pickup time slots.';
