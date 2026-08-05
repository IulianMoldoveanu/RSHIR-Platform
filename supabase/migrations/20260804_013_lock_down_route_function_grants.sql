-- Codex review (PR #1055, P1, round 3): fn_materialise_courier_order_route was
-- callable by anyone. Auditing pg_proc.proacl on prod found two more.
--
-- THE HOLE
--   fn_materialise_courier_order_route is SECURITY DEFINER and WRITES
--   courier_orders for whatever order id it is handed. It shipped with the
--   default ACL, so PostgREST exposed it as an RPC to anon and authenticated.
--   Anyone holding an order UUID could force a re-materialisation — and after
--   the 30-day trail purge that recomputes the order as unmeasured and wipes
--   the stored distances, destroying precisely the numbers the materialisation
--   exists to preserve. The inverse of this feature's central invariant.
--
-- WHY IT SLIPPED
--   Postgres grants EXECUTE to PUBLIC on every new function, and this project
--   additionally carries ALTER DEFAULT PRIVILEGES granting `authenticated`
--   EXECUTE explicitly. An explicit grant is NOT removed by
--   `revoke ... from public` — so `revoke from public, anon` (what
--   20260804_009 wrote for fn_courier_order_route) silently left
--   `authenticated=X` in place, while the functions where `authenticated` was
--   named explicitly (record_courier_ping, fn_delivery_metrics_by_fleet) came
--   out clean. Same author, same PR, two different habits; only one is safe.
--
--   Every future function in this schema needs all three named. Revoking from
--   PUBLIC alone is not enough here and never was.
--
-- POSTURE
--   Nothing in this feature is meant to be called by a browser. The courier
--   and fleet pages resolve routes through createAdminClient() (service_role),
--   and the two internal helpers are only ever reached from the close trigger,
--   which runs as the definer and needs no grant at all.

-- Writes courier_orders. Trigger-only: the trigger executes as its definer, so
-- no role needs EXECUTE — including service_role. Revoking it there buys no
-- security against a stolen service key (that key can UPDATE the table
-- directly), but it does stop a future caller from wiring this into app code
-- by mistake: calling it on a purged order silently replaces real distances
-- with nulls, and a permission error is a far better teacher than that.
revoke execute on function public.fn_materialise_courier_order_route(uuid)
  from public, anon, authenticated, service_role;

-- Trigger body. Returns `trigger`, so PostgREST would not surface it anyway —
-- locked for consistency rather than because a route is known.
revoke execute on function public.trg_compute_courier_order_route()
  from public, anon, authenticated, service_role;

-- Read-only, but it reports one order's movement aggregates for any UUID given.
-- Not a browser-facing surface: resolveOrderRoute() calls it as service_role.
revoke execute on function public.fn_courier_order_route(uuid)
  from public, anon, authenticated;
grant execute on function public.fn_courier_order_route(uuid) to service_role;

-- Pure arithmetic, no data access — harmless, but it is only ever called from
-- inside the SECURITY DEFINER functions above, so it has no reason to be part
-- of the public RPC surface either.
revoke execute on function public.fn_haversine_m(numeric, numeric, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.fn_haversine_m(numeric, numeric, numeric, numeric)
  to service_role;

comment on function public.fn_materialise_courier_order_route(uuid) is
  'Measures one courier order and writes the aggregate onto its row. '
  'INTERNAL: reachable only from trg_compute_courier_order_route, which runs '
  'as definer. No role holds EXECUTE, deliberately: re-running it after the '
  '30-day trail purge would overwrite preserved distances with nulls.';
