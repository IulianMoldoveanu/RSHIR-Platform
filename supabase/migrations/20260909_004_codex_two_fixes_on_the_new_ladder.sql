-- ============================================================================
-- Two corrections to 20260909_001/002, both raised by Codex on #1075 and both
-- right.
--
-- P1 — THE CITY FALLBACK COULD PICK A FLEET THAT DOES NOT RUN OUR APP.
--   courier_fleets.delivery_app = 'external' means the fleet dispatches through
--   its own system. Nothing forwards a newly created courier_orders row to that
--   system; the sweep and the push pipeline both target HIR courier profiles.
--   An EXPLICIT assignment to such a fleet is an admin's decision and stays
--   honoured. An IMPLICIT fallback is not, and must not quietly hand an order
--   to a dispatcher that will never hear about it. Every fleet is 'hir' today,
--   so this changes nothing now — it closes the door before the first external
--   fleet walks through it.
--
-- P2 — A DECLINE WAS RECORDED EVEN WHEN THE REVOKE LOST THE RACE.
--   The `expiring` CTE reads a snapshot; the update re-checks
--   `co.status = 'OFFERED'` and correctly skips an order a courier accepted in
--   the meantime — but the insert ran off the snapshot, so it filed a decline
--   against the courier who had just ACCEPTED. Two harms: the audit trail says
--   the opposite of what happened, and if that order ever returns to the pool
--   the sweep would sort the accepting courier last. The insert now reads from
--   the update's own RETURNING, so a decline exists only where a revocation
--   actually happened.
-- ============================================================================

create or replace function public.revoke_expired_courier_offers()
returns integer
language plpgsql
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
  v_count integer;
  v_row record;
  v_url text;
  v_auth text;
  v_external_dispatch boolean;
begin
  with expiring as (
    select id, assigned_courier_user_id
      from public.courier_orders
     where status = 'OFFERED'
       and offer_expires_at is not null
       and offer_expires_at < now()
  ), revoked as (
    update public.courier_orders co
       set status = 'CREATED',
           assigned_courier_user_id = null,
           offer_expires_at = null,
           updated_at = now()
      from expiring e
     where co.id = e.id
       and co.status = 'OFFERED'
    -- The courier has to come from `e`: co.assigned_courier_user_id is null by
    -- the time RETURNING reads it.
    returning co.id, e.assigned_courier_user_id as courier_user_id
  ), noted as (
    -- Codex P2 (#1075): only orders this statement actually revoked. An order
    -- accepted between the snapshot and the lock is skipped above, and must not
    -- leave a decline behind saying its courier ignored it.
    insert into public.courier_order_offer_declines (courier_order_id, courier_user_id, expired_at)
    select r.id, r.courier_user_id, now()
      from revoked r
     where r.courier_user_id is not null
    on conflict (courier_order_id, courier_user_id)
      do update set expired_at = excluded.expired_at
    returning 1
  )
  select count(*) into v_count from revoked;

  if v_count > 0 then
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'courier_push_dispatch_url' limit 1;
    select decrypted_secret into v_auth from vault.decrypted_secrets where name = 'courier_push_dispatch_auth' limit 1;
    if v_url is not null then
      for v_row in
        select co.id, co.fleet_id, co.source_tenant_id
          from public.courier_orders co
         where co.status = 'CREATED'
           and co.updated_at >= now() - interval '10 seconds'
           and co.fleet_id is not null
      loop
        v_external_dispatch := false;
        if v_row.source_tenant_id is not null then
          select t.external_dispatch_enabled into v_external_dispatch
            from public.tenants t where t.id = v_row.source_tenant_id;
        end if;
        if coalesce(v_external_dispatch, false) is not true then
          update public.courier_orders set courier_push_dispatched_at = now() where id = v_row.id;
          perform net.http_post(
            url := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json',
                                          'Authorization', 'Bearer ' || coalesce(v_auth, '')),
            body := jsonb_build_object('fleet_id', v_row.fleet_id, 'order_id', v_row.id,
                                       'urgent', true, 'reoffer', true)
          );
        end if;
      end loop;
    end if;
  end if;

  return v_count;
end;
$function$;

-- ---------------------------------------------------------------------------
-- The city step, restricted to fleets that dispatch through the HIR app.
-- Only the one predicate changes; the rest is 20260909_001 verbatim.
-- ---------------------------------------------------------------------------
create or replace function public.sync_restaurant_to_courier_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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

    v_pickup := v_settings->'pickup_address';
    if jsonb_typeof(v_pickup) = 'object' then
      v_pickup_line1 := v_pickup->>'line1';
      v_pickup_lat := nullif(v_pickup->>'lat','')::numeric;
      v_pickup_lng := nullif(v_pickup->>'lng','')::numeric;
      v_pickup_phone := nullif(v_pickup->>'phone','');
      v_pickup_name := nullif(v_pickup->>'name','');
    elsif jsonb_typeof(v_pickup) = 'string' then
      v_pickup_line1 := nullif(v_pickup #>> '{}', '');
      v_pickup_lat := coalesce(
        nullif(v_settings->>'location_lat','')::numeric,
        nullif(v_settings->'location'->>'lat','')::numeric
      );
      v_pickup_lng := coalesce(
        nullif(v_settings->>'location_lng','')::numeric,
        nullif(v_settings->'location'->>'lng','')::numeric
      );
      v_pickup_phone := coalesce(
        nullif(v_settings->>'pickup_phone',''),
        nullif(v_settings->>'whatsapp_phone','')
      );
      v_pickup_name := nullif(v_settings->>'pickup_name','');
    else
      v_pickup_line1 := null; v_pickup_lat := null; v_pickup_lng := null; v_pickup_phone := null; v_pickup_name := null;
    end if;

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
