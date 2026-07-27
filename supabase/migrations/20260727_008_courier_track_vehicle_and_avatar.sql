-- get_courier_track was missing vehicle_type and avatar_url — the customer
-- track page had no way to know these, so the map marker defaulted to a
-- hardcoded 'bike' icon regardless of the courier's real vehicle (owner
-- reported seeing a bike icon while delivering by car), and the courier's
-- photo was never available to show alongside their name.
--
-- Applied and verified live on prod before landing this file.

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
  v_courier_vehicle text;
  v_courier_avatar text;
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
    select cp.full_name, cp.vehicle_type, cp.avatar_url
      into v_courier_name, v_courier_vehicle, v_courier_avatar
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
        'vehicle_type', v_courier_vehicle,
        'avatar_url', v_courier_avatar,
        'last_lat', v_shift.last_lat,
        'last_lng', v_shift.last_lng,
        'last_seen_at', v_shift.last_seen_at
      )
    end
  );

  return v_payload;
end;
$function$;
