-- Finish the sweep #1099 started: take EXECUTE away from `authenticated` on
-- the 20 SECURITY DEFINER functions no logged-in user needs to call.
--
-- #1099 closed the `anon` side (23 functions, advisor 23 -> 0) and deliberately
-- left `authenticated` for its own pass, because the gate is different and
-- getting it wrong breaks the app for everyone who is signed in.
--
-- THE GATE: an RLS policy expression is evaluated as the querying role, so
-- that role needs EXECUTE on every function the expression calls. Five of the
-- 25 flagged functions are policy helpers and KEEP the grant:
--
--     is_tenant_member          32 policies
--     is_fleet_owner_of         13
--     is_tenant_member_of        9
--     current_courier_fleet_id   2
--     is_tenant_owner            1
--
-- All scoped to `authenticated`. Revoking there would turn 57 policies into
-- permission denied, which is the whole product for a signed-in user.
--
-- The other 20 appear in no policy, and every caller in the tree reaches them
-- with the service_role key -- Next.js API routes and server-only modules, the
-- Telegram edge function via SUPABASE_SERVICE_ROLE_KEY, and three SQL
-- functions that are themselves SECURITY DEFINER owned by postgres
-- (offer_courier_order, fn_auto_dispatch_sweep,
-- sync_restaurant_to_courier_order, which call courier_can_take_orders).
-- Negative sweep: no `fetch('/rest/v1/rpc/...')` anywhere, and no `.rpc(` in
-- any 'use client' component of restaurant-web, restaurant-admin or
-- restaurant-courier. The only browser Supabase client is for realtime
-- subscriptions.
--
-- This is not only hygiene. None of the 20 returns `trigger`, so every one is
-- genuinely invokable over PostgREST by any signed-in vendor or courier, and
-- three of them are abusable as they stand:
--
--   check_and_increment_usage(p_tenant_id, p_resource_kind, p_amount,
--     p_cap_override) takes the tenant as an ARGUMENT and derives nothing from
--     auth.uid(). Any logged-in user could burn another tenant's AI quota, or
--     lift their own ceiling through p_cap_override.
--
--   record_unmet_demand(p_tenant_id, ...) has no caller check at all and
--     inserts into demand_signals. Any logged-in user could attribute
--     fabricated demand to any tenant, which feeds growth analytics and the
--     demand-forecast-daily job.
--
--   verify_display_pin(p_tenant_slug, p_pin) is an oracle: brute-force any
--     tenant's kitchen-display PIN by slug. It also has no caller left --
--     api/display/auth reads tenant_display_pins directly.
--
-- The slot-change trio DOES check auth.uid() and raises on a failed guard, so
-- for those three this is defence in depth rather than closing a live hole.
-- submit_courier_kyc / submit_fleet_kyf check auth.uid() and write only the
-- caller's own row, but they are write paths into a feature removed in #1093.
--
-- Revoking does not change behaviour for the real callers: service_role is
-- untouched, and it legitimately passes any tenant_id.
--
-- Signatures come from the live catalog rather than being typed out, so an
-- overload cannot make a statement silently miss, and the block raises if a
-- name matches nothing -- a silent miss is how set_display_pin stayed open for
-- six months. `from public` and `from anon` are included as no-ops: cheap, and
-- they close the redundant path that defeated two migrations in May.

do $$
declare
  r record;
  v_revoke text[] := array[
    -- no caller at all
    'approve_slot_change', 'reject_slot_change', 'request_slot_change',
    'courier_is_kyc_verified', 'fleet_is_kyf_verified',
    'submit_courier_kyc', 'submit_fleet_kyf', 'verify_display_pin',
    -- service_role callers only
    'check_and_increment_usage', 'record_unmet_demand',
    'fn_reservation_request', 'fn_reserved_table_ids',
    'get_courier_track', 'get_courier_track_messages',
    'get_linked_courier_track_token', 'get_public_order',
    'post_courier_track_message', 'submit_delivery_rating',
    'submit_order_review',
    -- called only from SECURITY DEFINER functions owned by postgres
    'courier_can_take_orders'
  ];
  v_seen text[] := '{}';
begin
  for r in
    select p.oid::regprocedure::text as sig, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = any(v_revoke)
     order by p.proname
  loop
    execute format('revoke execute on function %s from authenticated', r.sig);
    execute format('revoke execute on function %s from anon', r.sig);
    execute format('revoke execute on function %s from public', r.sig);
    v_seen := v_seen || r.proname;
  end loop;

  if exists (select 1 from unnest(v_revoke) n where n <> all(v_seen)) then
    raise exception 'no function matched: %',
      (select string_agg(n, ', ') from unnest(v_revoke) n where n <> all(v_seen));
  end if;

  raise notice 'revoked authenticated+anon+public on % functions', cardinality(v_seen);
end $$;
