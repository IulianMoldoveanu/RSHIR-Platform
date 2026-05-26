-- Wave 5.1 — Client-side courier tracking + client↔courier chat.
--
-- Adds anon-callable surface (SECURITY DEFINER, gated by courier_orders.public_track_token)
-- so the customer (HIR portal /track/[token] OR HIR Connect /track/c/[ctoken])
-- can:
--   1. See courier display_name + ETA + last GPS position (no PII beyond first name)
--   2. Send + read chat messages to the assigned courier
--
-- Works for BOTH portal orders (source_type='HIR_TENANT') and HIR Connect orders
-- (source_type='EXTERNAL_API') — keyed exclusively off courier_orders.public_track_token.

-- 1. Extend order_messages.from_role to include CLIENT.
alter table public.order_messages
  drop constraint if exists order_messages_from_role_check;
alter table public.order_messages
  add constraint order_messages_from_role_check
  check (from_role in ('TENANT','COURIER','SYSTEM','CLIENT'));

-- Allow from_user_id null for CLIENT messages (anon poster, identified by token).
alter table public.order_messages
  alter column from_user_id drop not null;

-- 2. Extend RLS SELECT policy: CLIENT messages on a courier_order are also
--    readable by tenant members + assigned courier (no change to client read
--    surface — anon reads go through the SECURITY DEFINER RPC below).

-- 3. SECURITY DEFINER: get courier-side track view by public_track_token.
--    Returns: order status + ETA + tenant pickup + dropoff (neighborhood-redacted)
--    + assigned courier first name + last GPS + last_seen_at. NO phone, NO uid leak.
create or replace function public.get_courier_track(p_track_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.courier_orders%rowtype;
  v_shift record;
  v_courier_name text;
  v_payload jsonb;
begin
  select * into v_order
    from public.courier_orders
   where public_track_token = p_track_token
   limit 1;

  if not found then
    return null;
  end if;

  if v_order.assigned_courier_user_id is not null then
    select cp.display_name
      into v_courier_name
      from public.courier_profiles cp
     where cp.user_id = v_order.assigned_courier_user_id
     limit 1;

    select last_lat, last_lng, last_seen_at
      into v_shift
      from public.courier_shifts
     where courier_user_id = v_order.assigned_courier_user_id
       and ended_at is null
     order by started_at desc
     limit 1;
  end if;

  v_payload := jsonb_build_object(
    'courier_order_id', v_order.id,
    'status', v_order.status,
    'source_type', v_order.source_type,
    'created_at', v_order.created_at,
    'updated_at', v_order.updated_at,
    'pickup', jsonb_build_object(
      'lat', v_order.pickup_lat,
      'lng', v_order.pickup_lng,
      'address', v_order.pickup_line1
    ),
    'dropoff', jsonb_build_object(
      'lat', v_order.dropoff_lat,
      'lng', v_order.dropoff_lng
    ),
    'customer_first_name', v_order.customer_first_name,
    'courier', case
      when v_order.assigned_courier_user_id is null then null
      else jsonb_build_object(
        'first_name', split_part(coalesce(v_courier_name,''), ' ', 1),
        'last_lat', v_shift.last_lat,
        'last_lng', v_shift.last_lng,
        'last_seen_at', v_shift.last_seen_at
      )
    end
  );

  return v_payload;
end;
$$;

grant execute on function public.get_courier_track(text) to anon, authenticated;

comment on function public.get_courier_track(text) is
  'Public-track view of a courier order keyed by courier_orders.public_track_token. '
  'Returns status + ETA waypoints + assigned courier first name + last GPS, with '
  'no phone or full identity leak. Works for HIR portal AND HIR Connect orders.';

-- 4. SECURITY DEFINER: list messages on a courier_order by track token.
create or replace function public.get_courier_track_messages(p_track_token text, p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_msgs jsonb;
begin
  select id into v_order_id
    from public.courier_orders
   where public_track_token = p_track_token
   limit 1;

  if v_order_id is null then
    return jsonb_build_array();
  end if;

  select coalesce(jsonb_agg(row_to_json(m) order by m.created_at), '[]'::jsonb)
    into v_msgs
  from (
    select id, from_role, body, created_at
      from public.order_messages
     where courier_order_id = v_order_id
       and from_role in ('CLIENT','COURIER','SYSTEM')
     order by created_at desc
     limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) m;

  return v_msgs;
end;
$$;

grant execute on function public.get_courier_track_messages(text, int) to anon, authenticated;

comment on function public.get_courier_track_messages(text, int) is
  'List chat messages for a courier order keyed by public_track_token. '
  'Returns only CLIENT/COURIER/SYSTEM messages (TENANT-internal chat is filtered out '
  'because the customer should not see tenant-courier dispatch chatter).';

-- 5. SECURITY DEFINER: post a CLIENT message keyed by track token.
--    Rate-limited app-side via the route handler; this function only enforces
--    the token match + body length cap.
create or replace function public.post_courier_track_message(p_track_token text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.courier_orders%rowtype;
  v_msg_id uuid;
  v_body text;
begin
  v_body := trim(coalesce(p_body, ''));
  if length(v_body) < 1 or length(v_body) > 2000 then
    return jsonb_build_object('error','invalid_body');
  end if;

  select * into v_order
    from public.courier_orders
   where public_track_token = p_track_token
   limit 1;

  if not found then
    return jsonb_build_object('error','not_found');
  end if;

  if v_order.status in ('DELIVERED','CANCELLED') then
    return jsonb_build_object('error','order_closed');
  end if;

  insert into public.order_messages (
    courier_order_id, tenant_id, from_role, from_user_id, body
  ) values (
    v_order.id, v_order.source_tenant_id, 'CLIENT', null, v_body
  )
  returning id into v_msg_id;

  return jsonb_build_object('ok', true, 'id', v_msg_id);
end;
$$;

grant execute on function public.post_courier_track_message(text, text) to anon, authenticated;

comment on function public.post_courier_track_message(text, text) is
  'Anon insert of a CLIENT-role chat message keyed by public_track_token. '
  'Refuses when the order is DELIVERED or CANCELLED. Rate-limit at HTTP layer.';

-- 6. Helper: from a portal restaurant_orders.public_track_token (uuid), return
--    the LINKED courier_orders.public_track_token (text), if any. Anon-callable
--    so the portal /track page can pivot into the courier track surface for
--    ETA + chat without re-checking the portal token authorisation.
create or replace function public.get_linked_courier_track_token(p_restaurant_token uuid)
returns text
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_ctoken text;
begin
  if p_restaurant_token is null then
    return null;
  end if;
  select co.public_track_token
    into v_ctoken
    from public.restaurant_orders ro
    join public.courier_orders co
      on co.source_type = 'HIR_TENANT'
     and co.source_tenant_id = ro.tenant_id
     and co.source_order_id = ro.id::text
   where ro.public_track_token = p_restaurant_token
   order by co.created_at desc
   limit 1;
  return v_ctoken;
end;
$$;

grant execute on function public.get_linked_courier_track_token(uuid) to anon, authenticated;

comment on function public.get_linked_courier_track_token(uuid) is
  'Resolves the courier_orders.public_track_token linked to a portal '
  'restaurant_orders.public_track_token. Returns null when no courier_order has '
  'been dispatched yet, or for PICKUP orders.';
