-- ============================================================================
-- The order that keeps going back to the courier who did not answer.
--
-- Found on the Bucharest bench, 2026-09-09. Two riders online, both idle, A
-- nearer the pickup. The order is offered to A. A does nothing. The offer
-- expires, revoke_expired_courier_offers puts the order back in the pool and
-- clears assigned_courier_user_id — and the very next sweep scores the
-- candidates from scratch, finds A is still the nearest idle rider, and offers
-- it to A again. Measured: after a full expire-and-revoke cycle the order went
-- back to A, while B sat idle and never saw it.
--
-- Nothing anywhere remembers that a courier was already given this order and
-- let it lapse. That is the same shape as the 2026-08-09 incident (an order
-- re-offered every minute for four days); the fix then added age caps, which
-- bound how LONG the loop runs but not WHO it runs at. With one courier in a
-- city the difference is invisible. With five, an order can bounce off a phone
-- in a bag while four riders wait.
--
-- The fix is a memory and a tie-break, not a ban. A courier who let this
-- specific order expire sorts LAST, so they are still offered it when they are
-- the only one left — which is right, because the alternative is nobody. The
-- table also answers the question the 2026-08-09 post-mortem could not: who was
-- this order actually offered to, and when.
-- ============================================================================

create table if not exists public.courier_order_offer_declines (
  courier_order_id uuid not null references public.courier_orders(id) on delete cascade,
  courier_user_id  uuid not null,
  expired_at       timestamptz not null default now(),
  primary key (courier_order_id, courier_user_id)
);

comment on table public.courier_order_offer_declines is
  'One row per (order, courier) whose offer expired unanswered. Written by '
  'revoke_expired_courier_offers, read by fn_auto_dispatch_sweep as a LAST-'
  'RESORT tie-break: a courier who ignored this order is offered it again only '
  'when there is no one else.';

alter table public.courier_order_offer_declines enable row level security;
-- No policies: this is dispatch bookkeeping. SECURITY DEFINER functions and the
-- service role reach it; nothing client-side has any reason to.

grant select, insert, update on public.courier_order_offer_declines to service_role;

-- ---------------------------------------------------------------------------
-- Record who let the offer lapse, while revoking it.
--
-- The courier has to be read BEFORE the update nulls the column, so the
-- expiring rows are selected first and the update joins to them. The
-- `co.status = 'OFFERED'` guard is kept on the update itself so the race
-- behaviour is exactly what it was: a row someone else has already moved on
-- is not revoked twice.
-- ---------------------------------------------------------------------------
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
  ), noted as (
    insert into public.courier_order_offer_declines (courier_order_id, courier_user_id, expired_at)
    select e.id, e.assigned_courier_user_id, now()
      from expiring e
     where e.assigned_courier_user_id is not null
    on conflict (courier_order_id, courier_user_id)
      do update set expired_at = excluded.expired_at
    returning 1
  ), revoked as (
    update public.courier_orders co
       set status = 'CREATED',
           assigned_courier_user_id = null,
           offer_expires_at = null,
           updated_at = now()
      from expiring e
     where co.id = e.id
       and co.status = 'OFFERED'
    returning co.id
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
-- Offer it to someone who has not already ignored it.
--
-- Single new sort key, ahead of the score: couriers who let THIS order expire
-- go last. Everything below it is untouched, so among equals the winner is the
-- same courier the old scoring picked.
-- ---------------------------------------------------------------------------
create or replace function public.fn_auto_dispatch_sweep(p_timeout_seconds integer default 90, p_max_age_minutes integer default 180)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order   record;
  v_winner  uuid;
  v_offered integer := 0;
  v_result  jsonb;
begin
  -- Provably inert when the feature is off everywhere: a single cheap EXISTS check
  -- per cron tick when no fleet has opted in.
  if not exists (select 1 from public.courier_fleets where auto_dispatch_enabled and is_active) then
    return 0;
  end if;

  -- A non-positive or absurd cut-off would silently restore offer-forever.
  if p_max_age_minutes is null or p_max_age_minutes < 1 or p_max_age_minutes > 10080 then
    raise exception 'fn_auto_dispatch_sweep: p_max_age_minutes must be between 1 and 10080, got %',
      p_max_age_minutes;
  end if;

  for v_order in
    select co.id, co.fleet_id, co.pickup_lat, co.pickup_lng
      from public.courier_orders co
      join public.courier_fleets f on f.id = co.fleet_id
     where co.status = 'CREATED'
       and co.assigned_courier_user_id is null
       and f.auto_dispatch_enabled
       and f.is_active
       -- Give up only once the food has actually been waiting for a courier.
       -- Null readiness means the kitchen has not finished; that is not the
       -- courier's problem yet, so it is never aged out on this rule.
       and (
             coalesce(co.restaurant_ready_at, co.pharma_ready_at) is null
          or coalesce(co.restaurant_ready_at, co.pharma_ready_at)
               > now() - make_interval(mins => p_max_age_minutes)
           )
       -- Absolute backstop. Nothing legitimate sits a full day between
       -- PREPARING and pickup, and rows that never get a readiness stamp
       -- (the 2026-08-09 orphans) would otherwise be re-offered forever.
       and co.created_at > now() - interval '24 hours'
       -- A tenant order with no tenant is malformed — never dispatch it.
       and not (co.source_type = 'HIR_TENANT' and co.source_tenant_id is null)
     order by co.created_at asc
     limit 50  -- bound the work per tick; the rest are picked up next minute
  loop
    select cand.user_id
      into v_winner
      from (
        select cp.user_id,
               (select count(*)
                  from public.courier_orders a
                 where a.assigned_courier_user_id = cp.user_id
                   and a.status in ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT')) as active_load,
               sh.last_lat,
               sh.last_lng,
               -- Bucharest bench, 2026-09-09: this courier was already offered
               -- THIS order and let it lapse. Sorts last, never excluded.
               exists (
                 select 1 from public.courier_order_offer_declines d
                  where d.courier_order_id = v_order.id
                    and d.courier_user_id = cp.user_id
               ) as already_passed
          from public.courier_profiles cp
          join lateral (
            select cs.last_lat, cs.last_lng
              from public.courier_shifts cs
             where cs.courier_user_id = cp.user_id
               and cs.status = 'ONLINE'
               -- Codex P1 (round 6): same staleness rule courier-health-monitor
               -- already applies — an ONLINE shift with no recent ping is not
               -- actually a reachable courier.
               and cs.last_seen_at is not null
               and cs.last_seen_at >= now() - interval '5 minutes'
             order by cs.started_at desc
             limit 1
          ) sh on true
         where cp.fleet_id = v_order.fleet_id
           and cp.status = 'ACTIVE'  -- offer_courier_order requires ACTIVE-in-fleet
           -- Don't stack a second offer on a courier already holding a pending one.
           and not exists (
             select 1 from public.courier_orders o2
              where o2.assigned_courier_user_id = cp.user_id
                and o2.status = 'OFFERED'
           )
           -- Codex P1 (round 2): don't offer to a courier already at their configured cap.
           and (
             cp.max_parallel_orders is null
             or (
               select count(*)
                 from public.courier_orders a2
                where a2.assigned_courier_user_id = cp.user_id
                  and a2.status in ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT')
             ) < cp.max_parallel_orders
           )
           -- Codex P1 (round 4): don't offer to a courier the fleet's own
           -- KYC gate would block from accepting — same fail-closed rule
           -- courier_can_take_orders() applies everywhere else.
           and public.courier_can_take_orders(cp.user_id)
      ) cand
     order by
       -- Anyone who has not already ignored this order comes first.
       cand.already_passed asc,
       -- weighted score DESC (mirrors scoreCandidates total: loadScore + distanceScore)
       ( round((5 - least(cand.active_load, 5))::numeric / 5 * 60)
         + case
             when v_order.pickup_lat is null or v_order.pickup_lng is null
               or cand.last_lat is null or cand.last_lng is null
             then 0
             else round((10 - least(
               6371.0 * 2 * asin(sqrt(
                 power(sin(radians(cand.last_lat - v_order.pickup_lat) / 2), 2)
                 + cos(radians(v_order.pickup_lat)) * cos(radians(cand.last_lat))
                   * power(sin(radians(cand.last_lng - v_order.pickup_lng) / 2), 2)
               )), 10))::numeric / 10 * 40)
           end
       ) desc,
       -- exact-tie fallback = original heuristic: load ASC, raw distance ASC, user_id
       cand.active_load asc,
       ( case
           when v_order.pickup_lat is null or v_order.pickup_lng is null
             or cand.last_lat is null or cand.last_lng is null
           then 'Infinity'::float8
           else 6371000.0 * 2 * asin(sqrt(
             power(sin(radians(cand.last_lat - v_order.pickup_lat) / 2), 2)
             + cos(radians(v_order.pickup_lat)) * cos(radians(cand.last_lat))
               * power(sin(radians(cand.last_lng - v_order.pickup_lng) / 2), 2)
           ))
         end
       ) asc,
       cand.user_id asc
     limit 1;

    if v_winner is not null then
      -- Atomic CREATED → OFFERED; loses gracefully if the order was grabbed meanwhile.
      v_result := public.offer_courier_order(v_order.id, v_winner, v_order.fleet_id, p_timeout_seconds);
      if coalesce((v_result ->> 'offered')::boolean, false) then
        v_offered := v_offered + 1;
      end if;
    end if;
  end loop;

  return v_offered;
end;
$function$;
