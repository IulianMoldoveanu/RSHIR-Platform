-- Fix get_courier_track: referenced courier_profiles.display_name, a
-- column that has never existed (the real column is full_name). This broke
-- the public courier-tracking endpoint (/api/courier-track/[ctoken]) for
-- EVERY order with an assigned courier — Vercel alerting caught it live
-- ("Supabase RPC error: missing column cp.display_name", 15 failed calls
-- over 12 minutes) right as the owner reported the customer-facing courier
-- position/chat wasn't showing up on the map.
--
-- Applied and verified live on prod (qfmeojeojeipncuxeltnvab) before
-- landing this file: re-ran the RPC against a real in-flight order and
-- confirmed it now returns the courier's name + live position instead of
-- erroring.

CREATE OR REPLACE FUNCTION public.get_courier_track(p_track_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
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
    select cp.full_name
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
$function$;
