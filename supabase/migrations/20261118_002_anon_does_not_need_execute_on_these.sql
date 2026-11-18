-- Take EXECUTE away from `anon` on the 23 SECURITY DEFINER functions the
-- advisor flags, because not one of them is called with the anon key.
--
-- This is NOT the #1092 case. There, `revoke ... from anon` was a no-op because
-- the privilege came from PUBLIC (`=X/postgres`, no role name in front). Here
-- every one of the 23 carries an explicit `anon=X/postgres`, granted
-- deliberately at some point, so revoking from anon is the operative statement.
-- `from public` is included anyway: it costs nothing and closes the redundant
-- path that defeated two earlier migrations.
--
-- Checked call site by call site before writing this, because revoking EXECUTE
-- on a function the storefront needs breaks the storefront:
--
--   * 7 return `trigger` (fn_log_*, fn_enforce_*, fn_detect_nps_cluster,
--     fn_marketplace_match_rating_recalc, ..._touch_updated_at). PostgREST
--     cannot invoke those at all -- a direct call errors. Nobody needs them.
--
--   * Every customer-facing RPC is reached through a Next.js API route holding
--     the service_role key, never from the browser: get_public_order and
--     submit_order_review (api/track/[token]/*), get_courier_track,
--     get_courier_track_messages, post_courier_track_message,
--     submit_delivery_rating (api/courier-track/*, api/track/*/courier-rating),
--     get_linked_courier_track_token, and fn_reservation_request /
--     fn_reserved_table_ids ((storefront)/rezervari/actions.ts, which uses
--     getSupabaseAdmin()). The only `anon.rpc(...)` calls in the tree are in
--     apps/restaurant-web/.bench/, an untracked local harness.
--
--   * is_tenant_zone_paused is called with the admin client from
--     api/checkout/pricing.ts. verify_display_pin has no caller left at all --
--     api/display/auth reads tenant_display_pins directly.
--
--   * No `fetch('/rest/v1/rpc/...')` anywhere, no `.rpc(` in any 'use client'
--     component of restaurant-web, and the one browser client there is for
--     realtime subscriptions.
--
-- `authenticated` is also revoked where it is provably meaningless: the 7
-- trigger functions, plus fn_check_permit_valid / fn_courier_application_count /
-- fn_fleet_tier (no caller in SQL or application code) and is_tenant_zone_paused
-- (service_role only).
--
-- `authenticated` is KEPT on is_tenant_member_of and is_fleet_owner_of: they
-- appear in 9 and 13 RLS policies respectively, all scoped to `authenticated`.
-- A policy expression is evaluated as the querying role, so revoking EXECUTE
-- there would turn every one of those policies into permission denied.
--
-- `authenticated` is also kept on the 10 customer-facing RPCs. They are only
-- reachable through service_role today, so that grant is unused, but it is a
-- far smaller exposure than the anon key and belongs with the separate
-- `authenticated_security_definer_function_executable` sweep (36 functions),
-- not bolted onto this one.
--
-- Signatures come from the live catalog rather than being typed out, so an
-- overload or a changed argument list cannot make a statement silently miss.
-- Revoking a privilege that is not held is a no-op, so this is idempotent.

do $$
declare
  r record;
  v_anon_revoke text[] := array[
    'fn_check_permit_valid', 'fn_courier_application_count',
    'fn_courier_job_listings_touch_updated_at', 'fn_detect_nps_cluster',
    'fn_enforce_courier_application_limit', 'fn_fleet_tier',
    'fn_log_courier_permit_change', 'fn_log_marketplace_match_change',
    'fn_log_vendor_nps_rating', 'fn_marketplace_match_rating_recalc',
    'fn_reservation_request', 'fn_reserved_table_ids',
    'get_courier_track', 'get_courier_track_messages',
    'get_linked_courier_track_token', 'get_public_order',
    'is_fleet_owner_of', 'is_tenant_member_of', 'is_tenant_zone_paused',
    'post_courier_track_message', 'submit_delivery_rating',
    'submit_order_review', 'verify_display_pin'
  ];
  v_auth_revoke text[] := array[
    'fn_courier_job_listings_touch_updated_at', 'fn_detect_nps_cluster',
    'fn_enforce_courier_application_limit', 'fn_log_courier_permit_change',
    'fn_log_marketplace_match_change', 'fn_log_vendor_nps_rating',
    'fn_marketplace_match_rating_recalc',
    'fn_check_permit_valid', 'fn_courier_application_count', 'fn_fleet_tier',
    'is_tenant_zone_paused'
  ];
  v_seen text[] := '{}';
begin
  for r in
    select p.oid::regprocedure::text as sig, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = any(v_anon_revoke)
     order by p.proname
  loop
    execute format('revoke execute on function %s from anon', r.sig);
    execute format('revoke execute on function %s from public', r.sig);
    if r.proname = any(v_auth_revoke) then
      execute format('revoke execute on function %s from authenticated', r.sig);
    end if;
    v_seen := v_seen || r.proname;
  end loop;

  -- Fail loudly if a name in the list matched nothing: a silent miss here is
  -- how a function stays open for months (see #1092).
  if exists (select 1 from unnest(v_anon_revoke) n where n <> all(v_seen)) then
    raise exception 'no function matched: %',
      (select string_agg(n, ', ') from unnest(v_anon_revoke) n where n <> all(v_seen));
  end if;

  raise notice 'revoked anon+public on % functions', cardinality(v_seen);
end $$;
