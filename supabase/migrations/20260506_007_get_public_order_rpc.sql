-- RSHIR-TODO-SWEEP 2026-05-06: get_public_order(token uuid) RPC.
--
-- Replaces the service-role anonymous read at /api/track/[token]/route.ts.
-- Same trust model as the existing submit_order_review RPC: "you know the
-- public_track_token" is the auth signal. Returns ONLY the safe column
-- subset rendered on the public /track UI — no PII beyond first name +
-- last-name initial, no internal notes, no courier identity, no payment
-- provider IDs.
--
-- security definer + revoke-from-public + grant-to-anon mirrors the pattern
-- in 20260430_001_restaurant_reviews.sql. search_path is locked to public.
--
-- Returns jsonb (or null when token does not match), matching the shape
-- the Next.js route already builds, so the route can drop the service-role
-- read entirely and the column-fallback defensive code that protects
-- against payment_method-not-yet-applied migration drift.

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

  v_tenant_name       text;
  v_tenant_slug       text;
  v_tenant_settings   jsonb;

  v_cust_first        text;
  v_cust_last         text;

  v_addr_line1        text;
  v_addr_city         text;

  v_has_review        boolean := false;
begin
  if p_token is null then
    return null;
  end if;

  select
    o.id,
    o.status,
    o.payment_status,
    o.payment_method,
    o.items,
    o.subtotal_ron,
    o.delivery_fee_ron,
    o.total_ron,
    o.created_at,
    o.updated_at,
    o.public_track_token,
    o.delivery_address_id,
    o.tenant_id,
    o.customer_id
  into
    v_order_id, v_status, v_payment_status, v_payment_method, v_items,
    v_subtotal_ron, v_delivery_fee_ron, v_total_ron, v_created_at,
    v_updated_at, v_public_token, v_delivery_addr_id, v_tenant_id,
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

  if v_customer_id is not null then
    select c.first_name, c.last_name
    into v_cust_first, v_cust_last
    from public.customers c
    where c.id = v_customer_id;
  end if;

  if v_delivery_addr_id is not null then
    select a.line1, a.city
    into v_addr_line1, v_addr_city
    from public.customer_addresses a
    where a.id = v_delivery_addr_id;
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
    'delivery_address_id', v_delivery_addr_id,
    'has_review', v_has_review,
    'tenant', case when v_tenant_name is null then null else jsonb_build_object(
      'name', v_tenant_name,
      'slug', v_tenant_slug,
      'settings', v_tenant_settings
    ) end,
    'customer', case when v_cust_first is null and v_cust_last is null then null
      else jsonb_build_object(
        'first_name', v_cust_first,
        'last_name', v_cust_last
      ) end,
    'customer_address', case when v_addr_line1 is null and v_addr_city is null then null
      else jsonb_build_object(
        'line1', v_addr_line1,
        'city', v_addr_city
      ) end
  );
end;
$$;

revoke all on function public.get_public_order(uuid) from public;
grant execute on function public.get_public_order(uuid) to anon, authenticated;

comment on function public.get_public_order(uuid) is
  'Returns the public-track view of a restaurant order keyed by public_track_token. Security definer; safe to expose to anon. Mirrors the safe column subset rendered on /track/[token].';
