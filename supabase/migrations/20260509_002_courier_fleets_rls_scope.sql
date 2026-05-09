-- HIR Restaurant Suite — courier_fleets RLS scope tightening
--
-- Closes P1-3 from the 2026-05-09 security audit:
--   policy `courier_fleets_public_read` was `using (true)` for the
--   `authenticated` role, meaning any logged-in user (e.g. a customer
--   on the storefront after magic-link OTP) could SELECT every row of
--   courier_fleets including webhook_url + brand_color + custom_domain.
--
-- Codex P1 absorb (2026-05-09): tightened to FLEET OWNER ONLY.
-- The previous draft also let tenant members of an FRA-assigned tenant
-- read the fleet row — but that violates the fleet-confidentiality
-- contract from `20260507_011_fleet_allocation_v1.sql` (merchants must
-- not learn fleet identity; they only see sanitised status via the
-- order tracker). Tenant members do not need direct courier_fleets
-- reads — every legit in-app callsite uses createAdminClient
-- (service-role) which bypasses RLS.
--
-- Application callsite audit (2026-05-09 evening): all 7 in-app
-- callsites of `.from('courier_fleets')` use createAdminClient
-- (service-role), unaffected by RLS. The leak vector being closed is
-- direct anon/authenticated client queries.
--
-- Idempotent. Safe to re-apply.

-- 1. Drop the unscoped public read policy + any prior draft on this
--    same migration.
drop policy if exists courier_fleets_public_read on public.courier_fleets;
drop policy if exists courier_fleets_scoped_read on public.courier_fleets;

-- 2. Fleet-owner-only read policy. Service-role bypasses RLS;
--    PLATFORM_ADMIN reads via service-role admin client by convention.
create policy courier_fleets_owner_read
  on public.courier_fleets
  for select
  to authenticated
  using (owner_user_id = auth.uid());

-- 3. Drop the SECURITY DEFINER helper if it was created in an earlier
--    iteration of this migration — no longer needed under the
--    owner-only policy.
drop function if exists public.is_fleet_visible_to_user(uuid, uuid);
