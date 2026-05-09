-- HIR Restaurant Suite — courier_fleets RLS scope tightening
--
-- Closes P1-3 from the 2026-05-09 security audit:
--   policy `courier_fleets_public_read` was `using (true)` for the
--   `authenticated` role, meaning any logged-in user (e.g. a customer
--   on the storefront after magic-link OTP) could SELECT every row of
--   courier_fleets including webhook_url + brand_color + custom_domain.
--
-- Application callsite audit (2026-05-09 evening): all 7 in-app
-- callsites use createAdminClient (service-role), so service-role
-- bypasses RLS and is unaffected. Only direct anon/authenticated client
-- queries see the tightening — those are the leak we want to close.
--
-- Pattern mirrors `fra_fleet_owner_read` (`20260507_011_fleet_allocation_v1.sql`).
-- Members of a tenant assigned to a fleet see THAT fleet only.
--
-- Idempotent. Safe to re-apply.

-- 1. SECURITY DEFINER helper to break the RLS recursion that would
--    otherwise occur (courier_fleets policy -> FRA -> courier_fleets).
--    The helper runs with table owner privileges, bypassing RLS on
--    fleet_restaurant_assignments + tenant_members internally. Mirrors
--    the existing public.is_tenant_member / is_tenant_owner pattern.
create or replace function public.is_fleet_visible_to_user(p_fleet_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_members tm
    join public.fleet_restaurant_assignments fra
      on fra.fleet_id = p_fleet_id
     and fra.restaurant_tenant_id = tm.tenant_id
    where tm.user_id = p_user_id
  );
$$;

revoke all on function public.is_fleet_visible_to_user(uuid, uuid) from public, anon;
grant execute on function public.is_fleet_visible_to_user(uuid, uuid) to authenticated, service_role;

-- 2. Drop the unscoped public read policy.
drop policy if exists courier_fleets_public_read on public.courier_fleets;
drop policy if exists courier_fleets_scoped_read on public.courier_fleets;

-- 3. Scoped policy via SECURITY DEFINER helper. Two paths:
--    a) fleet OWNER (owner_user_id = auth.uid())
--    b) tenant member whose tenant has an FRA row to this fleet
--    Service-role bypasses RLS entirely; PLATFORM_ADMIN reads via
--    service-role admin client by convention.
create policy courier_fleets_scoped_read
  on public.courier_fleets
  for select
  to authenticated
  using (
    owner_user_id = auth.uid()
    or public.is_fleet_visible_to_user(id, auth.uid())
  );

-- 3. Note on column-level revoke:
--    A `revoke select (webhook_url) ... from authenticated` DOES NOT
--    override the table-level GRANT SELECT that Supabase puts on every
--    public table for anon + authenticated. So we don't ship a column
--    revoke here — the scoped row policy above is the actual fix.
--    Hardening webhook_url to service-role-only is tracked as a P3
--    follow-up (would require revoking table-level SELECT and granting
--    a per-column allow-list to authenticated, with full callsite
--    sweep). For now, webhook_url is only readable from rows the user
--    is already authorized to see — narrow enough to ship.
