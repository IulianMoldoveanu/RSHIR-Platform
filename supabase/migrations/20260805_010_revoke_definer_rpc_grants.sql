-- Six SECURITY DEFINER functions were executable by `authenticated`.
--
-- They exist to be called by the server with the service-role key, and every
-- caller in the codebase does exactly that. But EXECUTE was also granted to
-- `authenticated`, and each one takes the identity it acts on as a plain
-- argument and does no authorization of its own. Any logged-in user could
-- therefore call them directly through PostgREST with someone else's ids:
--
--   fn_loyalty_earn              mint loyalty points on any tenant, any customer
--   fn_loyalty_redeem            burn any customer's balance
--   fn_inventory_manual_adjust   move any tenant's stock, and name any user as
--                                the actor in the audit ledger
--   fn_set_fleet_pickup_km_tariff  rewrite courier/vendor pay rates for any
--                                fleet, and name any user as the author
--   offer_courier_order          offer any order to any courier
--   fn_recalc_driver_score       rewrite any courier's score
--
-- The two that raise exceptions do so for validation (delta ≠ 0, cents in
-- range), not for authorization — worth stating because it reads like a guard.
--
-- This is the same mistake as the one caught on the GPS work in review round 3,
-- and it has the same root: on Supabase, ALTER DEFAULT PRIVILEGES grants
-- EXECUTE to `authenticated` explicitly, so `revoke ... from public` does not
-- take it away. Every role has to be named.
--
-- Also pins search_path. The bodies are schema-qualified, so this is defence in
-- depth rather than a live hole, but a SECURITY DEFINER function with a
-- caller-controlled search_path is a standing invitation.

do $$
declare
  sig text;
  sigs text[] := array[
    'public.fn_loyalty_earn(uuid, uuid, uuid, integer, text)',
    'public.fn_loyalty_redeem(uuid, uuid, uuid, integer, text)',
    'public.fn_inventory_manual_adjust(uuid, uuid, numeric, text, uuid)',
    'public.fn_set_fleet_pickup_km_tariff(uuid, text, integer, integer, integer, uuid)',
    'public.offer_courier_order(uuid, uuid, uuid, integer)',
    'public.fn_recalc_driver_score(uuid)'
  ];
begin
  foreach sig in array sigs loop
    -- Skip anything not present, so the migration is safe on a branch database
    -- that predates one of these.
    if to_regprocedure(sig) is null then
      raise notice 'skipping %, not present', sig;
      continue;
    end if;

    execute format('revoke all on function %s from public, anon, authenticated', sig);
    execute format('grant execute on function %s to service_role', sig);
    execute format('alter function %s set search_path = public, pg_temp', sig);
  end loop;
end $$;
