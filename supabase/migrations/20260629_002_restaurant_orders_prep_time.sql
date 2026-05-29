-- restaurant_orders: add prep_time_minutes + confirmed_at
--
-- When the operator confirms a manual / storefront order, they can now pick a
-- prep_time (10/15/20/30/45/60 or custom). This drives the customer-facing ETA
-- on /track/:token (replaces the generic tenant-default minutes) so the patron
-- sees "Gata în ~{prep_time_minutes} min" instead of the same string for
-- 1 coffee vs 5 pizzas.
--
-- Nullable + default null — if the operator skips the modal (default click),
-- the public track page keeps falling back to tenant settings as before.
--
-- get_public_order RPC is patched in this migration so the redacted public
-- shape includes prep_time_minutes alongside the rest of the order fields.

alter table public.restaurant_orders
  add column if not exists prep_time_minutes int
    check (prep_time_minutes is null or (prep_time_minutes between 1 and 240));

alter table public.restaurant_orders
  add column if not exists confirmed_at timestamptz;

comment on column public.restaurant_orders.prep_time_minutes is
  'Operator-chosen prep time at CONFIRMED transition. Drives the public track ETA. Null = fall back to tenant settings.';

comment on column public.restaurant_orders.confirmed_at is
  'Timestamp the operator confirmed the order (status -> CONFIRMED).';

-- Widen payment_status check to allow 'PENDING' for CARD manual orders that
-- haven't gone through a PSP capture yet. COD orders stay on 'UNPAID' (cash
-- hasn't arrived); CARD-manual-not-yet-captured uses 'PENDING' so reports
-- can separate "awaiting cash" from "awaiting card capture". The widened
-- set is a strict superset of the original ('UNPAID','PAID','REFUNDED',
-- 'FAILED') so existing rows still validate.
do $$
declare
  v_conname text;
begin
  select c.conname
    into v_conname
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'restaurant_orders'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%payment_status%'
  limit 1;

  if v_conname is not null then
    execute format(
      'alter table public.restaurant_orders drop constraint %I',
      v_conname
    );
  end if;
end
$$;

alter table public.restaurant_orders
  add constraint restaurant_orders_payment_status_check
  check (payment_status in ('UNPAID','PENDING','PAID','REFUNDED','FAILED'));

-- ----------------------------------------------------------------
-- Patch get_public_order to expose prep_time_minutes to anon.
-- Mirrors 20260506_008: redaction lives in the function, not the route.
-- ----------------------------------------------------------------
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
  v_confirmed_at      timestamptz;
  v_prep_time_minutes int;
  v_public_token      uuid;
  v_delivery_addr_id  uuid;
  v_tenant_id         uuid;
  v_customer_id       uuid;

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
    o.updated_at, o.confirmed_at, o.prep_time_minutes,
    o.public_track_token, o.delivery_address_id,
    o.tenant_id, o.customer_id
  into
    v_order_id, v_status, v_payment_status, v_payment_method, v_items,
    v_subtotal_ron, v_delivery_fee_ron, v_total_ron, v_created_at,
    v_updated_at, v_confirmed_at, v_prep_time_minutes,
    v_public_token, v_delivery_addr_id, v_tenant_id,
    v_customer_id
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
    'confirmed_at', v_confirmed_at,
    'prep_time_minutes', v_prep_time_minutes,
    'public_track_token', v_public_token,
    'fulfillment', case when v_delivery_addr_id is null then 'PICKUP' else 'DELIVERY' end,
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
  'Public-track view of an order keyed by public_track_token. Security definer; safe to expose to anon. Redacts customer.last_name to initial, drops full street address (returns neighborhood only), whitelists tenant settings keys, and exposes operator-chosen prep_time_minutes when set.';
