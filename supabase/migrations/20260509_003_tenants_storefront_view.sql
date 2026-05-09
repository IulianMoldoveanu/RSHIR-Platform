-- HIR Restaurant Suite — tenants storefront view + anon revoke
--
-- Closes P1-2 from the 2026-05-09 security audit:
--   * Anon role had SELECT on all rows of public.tenants where status='ACTIVE'
--     (or custom_domain ACTIVE), exposing the entire `settings` JSONB plus
--     top-level columns including `external_dispatch_secret`.
--   * Sensitive subkeys (cod_caen, cui, reg_com, contact_email, onboarding,
--     pause_reason, etc.) were leaking to anon callers.
--
-- Approach (audit option C — view + revoke, NOT a sibling table):
--   1. Create `public.v_tenants_storefront` exposing the same columns as
--      tenants EXCEPT the explicitly-internal ones, with a sanitised
--      settings JSONB (internal subkeys stripped).
--   2. Drop the unscoped anon policy on tenants and revoke anon SELECT on
--      the table.
--   3. Storefront callsites (apps/restaurant-web/src/lib/tenant.ts +
--      sitemap + not-found + cities) switch to the view in a follow-up
--      commit on this same PR.
--
-- Idempotent. Safe to re-apply.

-- ============================================================
-- 1. The storefront-safe view
-- ============================================================
-- security_invoker=on so RLS evaluates as the calling role (still useful
-- for the authenticated tenant_member path that goes through the same
-- view from the storefront if signed in). For anon, we explicitly grant
-- SELECT on the view itself; the underlying tenants table grant has
-- been revoked, but views don't propagate the underlying-table grant
-- requirement when security_invoker is FALSE — so we leave it OFF here.
-- The view's content is a deliberate allow-list, evaluated as the view
-- owner (postgres).

create or replace view public.v_tenants_storefront
with (security_invoker = off)
as
  select
    id,
    slug,
    name,
    vertical,
    custom_domain,
    status,
    dispatch_mode,
    domain_status,
    domain_verified_at,
    integration_mode,
    template_slug,
    city_id,
    feature_flags,
    created_at,
    updated_at,
    -- Sanitised settings: strip internal/operational keys.
    -- Keys explicitly stripped:
    --   cod_caen, cui, reg_com, legal_company, legal_address,
    --   legal_postal_code  -> fiscal/legal entity registry data
    --   contact_email                -> avoid owner email enumeration
    --   email_notifications_enabled, onboarding, pause_reason
    --                                -> operational state
    -- Everything else (branding, theme, presentation_*, business_hours,
    -- min_order_ron, etc.) is kept since storefront UI reads them.
    coalesce(settings, '{}'::jsonb)
      - 'cod_caen'
      - 'cui'
      - 'reg_com'
      - 'legal_company'
      - 'legal_address'
      - 'legal_postal_code'
      - 'contact_email'
      - 'email_notifications_enabled'
      - 'onboarding'
      - 'pause_reason'
      as settings
  from public.tenants
  where status = 'ACTIVE'
     or (custom_domain is not null and domain_status = 'ACTIVE');

comment on view public.v_tenants_storefront is
  'Storefront-safe projection of public.tenants. Excludes external_dispatch_*, fiscal/legal registry fields, and operational state from settings. Used by anon + authenticated storefront callers in apps/restaurant-web. Internal callers use the underlying tenants table via service-role admin client.';

grant select on public.v_tenants_storefront to anon, authenticated;

-- ============================================================
-- 2. Drop the anon SELECT policy + revoke table-level anon grant
-- ============================================================
drop policy if exists tenants_anon_select on public.tenants;

-- Revoke table-level SELECT from anon. Authenticated keeps SELECT but is
-- gated by the existing tenants_member_select policy (is_tenant_member).
revoke select on public.tenants from anon;

-- ============================================================
-- 3. Sanity: tenants_member_select policy on authenticated still
--    intact (no-op, just documentation).
-- ============================================================
-- The authenticated role retains the existing
-- `tenants_member_select using (is_tenant_member(id))` policy — that
-- restricts authenticated reads to tenant members only. Anon storefront
-- traffic now reads through v_tenants_storefront only.
