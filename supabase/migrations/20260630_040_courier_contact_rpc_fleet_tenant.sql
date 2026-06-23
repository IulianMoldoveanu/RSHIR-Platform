-- 20260630_040_courier_contact_rpc_fleet_tenant.sql
-- ⚠️ REVIEW-READY — apply to prod via the Supabase Management API after staging.
-- Merging this file does NOT auto-apply it (this repo applies migrations manually).
--
-- GDPR pool-ingress hardening — STAGE 2 foundation (audit board, HIR-ECOSYSTEM-AUDIT-2026-06-18).
-- Stage 1 (20260630_036/037) added get_courier_order_contact for the ASSIGNED courier.
-- But fleet managers and tenant admins ALSO legitimately read customer_phone/first_name
-- (dispatch lists, order detail, reassign). To route ALL pool-contact reads through an
-- authorized path BEFORE the column is hashed in Stage 3, this adds the two missing
-- authorized RPCs (+ array variants for the ≤200-row list pages so we avoid N round-trips).
--
-- PURELY ADDITIVE — changes nothing existing and wires NO consumer. The app keeps reading
-- the plaintext column directly until Stages 2.1-2.3 rewire reads onto these RPCs. That
-- rewire is what lets Stage 3 hash the column without dark screens.
--
-- Auth predicates are 1:1 with the live code:
--   * fleet:  courier_fleets.owner_user_id = auth.uid()   (apps/.../lib/fleet-manager.ts:39)
--   * tenant: tenant_members(tenant_id = co.source_tenant_id, user_id = auth.uid(),
--             role in OWNER/STAFF/FLEET_MANAGER)           (20260425_000:30 + 20260603_002:19)
-- fleet_id / tenant_id come from the TRUSTED join on the order — never a client argument —
-- so a manager can't probe another fleet/tenant. Same hardening footer as _036/_037.
-- Matches _037 style exactly: language sql, stable, security definer, search_path = ''.
--
-- Idempotent (create or replace).

-- ── Fleet-manager scope ──────────────────────────────────────────────────────
create or replace function public.get_fleet_order_contact(p_order_id uuid)
returns table (customer_first_name text, customer_phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select co.customer_first_name, co.customer_phone
    from public.courier_orders co
    join public.courier_fleets cf on cf.id = co.fleet_id
   where co.id = p_order_id
     and cf.owner_user_id = auth.uid();
$$;

create or replace function public.get_fleet_order_contacts(p_order_ids uuid[])
returns table (order_id uuid, customer_first_name text, customer_phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select co.id, co.customer_first_name, co.customer_phone
    from public.courier_orders co
    join public.courier_fleets cf on cf.id = co.fleet_id
   where co.id = any(p_order_ids)
     and cf.owner_user_id = auth.uid();
$$;

comment on function public.get_fleet_order_contact(uuid) is
  'GDPR Stage 2: authorized customer-contact lookup for the FLEET MANAGER that owns '
  'the order''s fleet (courier_fleets.owner_user_id = auth.uid()). Sole fleet access '
  'path Stages 2-3 migrate the fleet UI onto before the pool column is hashed.';
comment on function public.get_fleet_order_contacts(uuid[]) is
  'Batch variant of get_fleet_order_contact for the fleet order-list pages (≤200 rows) '
  'so contact is fetched in one round-trip. Same owner-of-fleet auth.';

-- ── Tenant-admin scope ───────────────────────────────────────────────────────
create or replace function public.get_tenant_order_contact(p_order_id uuid)
returns table (customer_first_name text, customer_phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select co.customer_first_name, co.customer_phone
    from public.courier_orders co
   where co.id = p_order_id
     and exists (
       select 1
         from public.tenant_members tm
        where tm.tenant_id = co.source_tenant_id
          and tm.user_id = auth.uid()
          and tm.role in ('OWNER', 'STAFF', 'FLEET_MANAGER')
     );
$$;

create or replace function public.get_tenant_order_contacts(p_order_ids uuid[])
returns table (order_id uuid, customer_first_name text, customer_phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select co.id, co.customer_first_name, co.customer_phone
    from public.courier_orders co
   where co.id = any(p_order_ids)
     and exists (
       select 1
         from public.tenant_members tm
        where tm.tenant_id = co.source_tenant_id
          and tm.user_id = auth.uid()
          and tm.role in ('OWNER', 'STAFF', 'FLEET_MANAGER')
     );
$$;

comment on function public.get_tenant_order_contact(uuid) is
  'GDPR Stage 2: authorized customer-contact lookup for a member (OWNER/STAFF/'
  'FLEET_MANAGER) of the order''s source tenant. Sole tenant-admin access path '
  'Stages 2-3 migrate the admin UI onto before the pool column is hashed.';
comment on function public.get_tenant_order_contacts(uuid[]) is
  'Batch variant of get_tenant_order_contact for the admin live-orders list. '
  'Same source-tenant-member auth.';

-- ── Hardening footer (verbatim from _036/_037) ──────────────────────────────
revoke all on function public.get_fleet_order_contact(uuid) from public;
revoke all on function public.get_fleet_order_contact(uuid) from anon;
grant execute on function public.get_fleet_order_contact(uuid) to authenticated;

revoke all on function public.get_fleet_order_contacts(uuid[]) from public;
revoke all on function public.get_fleet_order_contacts(uuid[]) from anon;
grant execute on function public.get_fleet_order_contacts(uuid[]) to authenticated;

revoke all on function public.get_tenant_order_contact(uuid) from public;
revoke all on function public.get_tenant_order_contact(uuid) from anon;
grant execute on function public.get_tenant_order_contact(uuid) to authenticated;

revoke all on function public.get_tenant_order_contacts(uuid[]) from public;
revoke all on function public.get_tenant_order_contacts(uuid[]) from anon;
grant execute on function public.get_tenant_order_contacts(uuid[]) to authenticated;
