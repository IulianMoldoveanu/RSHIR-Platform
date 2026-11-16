-- Migration 20260522_003_ops_settings.sql stated its intent in a comment:
--
--     -- Intentionally NOT granted to anon/authenticated — service-role only.
--     revoke execute on function public.set_display_pin(uuid, text)
--       from anon, authenticated;
--
-- The database disagreed. Postgres grants EXECUTE on a newly created function
-- to PUBLIC, and anon/authenticated are members of PUBLIC — so revoking their
-- *direct* grants left the privilege fully intact. The live ACL read:
--
--     =X/postgres | postgres=X/postgres | service_role=X/postgres
--
-- The leading `=X/` is PUBLIC. That is the grant nobody revoked, in this
-- migration or in 20260522_004, which repeated the same ineffective revoke.
--
-- Proven live with the project's public anon key on 2026-11-16: POST to
-- /rest/v1/rpc/set_display_pin with an all-zero tenant uuid returned 23503,
-- a foreign-key violation raised from *inside* the INSERT — not 42501,
-- permission denied. The body executed. With a real tenant uuid it would have
-- written. (The zero uuid was chosen so the FK would reject the row: the probe
-- proved reachability without storing anything.)
--
-- Impact, stated precisely: set_display_pin writes a bcrypt hash via crypt().
-- No application code calls this RPC — the admin writer
-- (apps/restaurant-admin/.../tenants/[id]/display-pin/route.ts) and the courier
-- display verifier (apps/restaurant-courier/.../api/display/auth/route.ts) both
-- hash with scrypt in Node, and verifyPin() returns false on any stored hash
-- that is not `scrypt:<salt>:<hash>`. So an anon caller gains no display
-- access, but can overwrite any tenant's pin_hash with a bcrypt string and
-- thereby lock that restaurant's kitchen display out of its own correct PIN —
-- unauthenticated, needing only the tenant uuid. tenant_display_pins is empty
-- today, so no tenant is exposed yet; this closes the door before the first
-- Bucharest kitchen display is configured.
--
-- `revoke ... from public` is the form that actually works.
--
-- Note for whoever edits these next: CREATE OR REPLACE preserves the ACL, but
-- DROP + CREATE resets it to EXECUTE TO PUBLIC and silently reopens this.

revoke execute on function public.set_display_pin(p_tenant_id uuid, p_new_pin text) from public;

-- The same trap, closed pre-emptively on the other seven SECURITY DEFINER
-- functions that carry a PUBLIC grant. These are the storefront's intentional
-- anon surface (order tracking, the courier track channel, reservations) and
-- each already holds an *explicit* grant to both anon and authenticated.
-- Removing PUBLIC therefore provably changes nothing about who may call them —
-- has_function_privilege() for both roles is unchanged, which the snapshot
-- taken either side of this migration confirms. What it removes is the
-- redundant path that would defeat a future `revoke ... from anon` exactly as
-- it defeated this one.

revoke execute on function public.fn_reservation_request(p_tenant_id uuid, p_first_name text, p_phone text, p_email text, p_party_size integer, p_requested_at timestamp with time zone, p_notes text, p_table_id text) from public;
revoke execute on function public.fn_reserved_table_ids(p_tenant_id uuid, p_requested_at timestamp with time zone) from public;
revoke execute on function public.get_courier_track(p_track_token text) from public;
revoke execute on function public.get_courier_track_messages(p_track_token text, p_limit integer) from public;
revoke execute on function public.get_linked_courier_track_token(p_restaurant_token uuid) from public;
revoke execute on function public.post_courier_track_message(p_track_token text, p_body text) from public;
revoke execute on function public.verify_display_pin(p_tenant_slug text, p_pin text) from public;

-- Three orphaned maintenance helpers that hold *explicit* anon and
-- authenticated grants and that write. No application code calls them (only
-- comments and generated types reference the names) and no pg_cron job runs
-- them — the 37 scheduled jobs were listed and none does. They are reachable
-- with the public key today:
--
--   fn_expire_courier_permits()        flips permit_status to EXPIRED
--   fn_expire_courier_job_listings()   flips listing status to EXPIRED
--   fn_recalc_fleet_aggregate(uuid)    recomputes a fleet's score and can set
--                                      auto_paused_at, which is deliberately
--                                      sticky: ops must clear it by hand
--
-- The two expiry helpers only act on rows whose own deadline has already
-- passed, so an early call does what the schedule would have done anyway —
-- the exposure is small. fn_recalc_fleet_aggregate is the one that matters:
-- an anon caller can force a fleet below the 3.80 threshold into a sticky
-- auto-pause. service_role and postgres keep their access.

revoke execute on function public.fn_expire_courier_permits() from anon, authenticated;
revoke execute on function public.fn_expire_courier_job_listings() from anon, authenticated;
revoke execute on function public.fn_recalc_fleet_aggregate(p_fleet_id uuid) from anon, authenticated;
