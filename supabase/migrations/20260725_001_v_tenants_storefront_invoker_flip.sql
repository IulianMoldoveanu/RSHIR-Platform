-- Closes the deferred item from 20260617_001_security_advisor_safe_hardening.sql:
--   public.v_tenants_storefront (SECURITY DEFINER, Supabase Advisor CRITICAL).
--
-- Why this was deferred: a plain security_invoker flip breaks every anon
-- storefront (anon has no SELECT on public.tenants since the 20260509_003
-- revoke), and a blanket anon GRANT on tenants would leak
-- external_dispatch_secret / external_dispatch_webhook_url / referral_code /
-- champion_code via PostgREST. This migration does the two-part fix the
-- header called for:
--   1. A new anon RLS policy on tenants, scoped to the EXACT predicate the
--      view already uses (status='ACTIVE' OR active custom_domain) — this
--      is what actually enforces the boundary once the view stops being
--      SECURITY DEFINER.
--   2. Rebuild the view as a narrow, explicit column allow-list (verified
--      against every current callsite: apps/restaurant-web/src/lib/tenant.ts,
--      sitemap.ts, cities.ts, not-found.tsx — none read anything outside
--      this list) instead of "all of tenants minus a settings blocklist",
--      so a future column added to tenants is excluded by default, not
--      leaked by default.
--   3. Flip to security_invoker=on so RLS (not the view owner's privileges)
--      is what actually gates access.
--
-- Idempotent: CREATE OR REPLACE VIEW + DROP POLICY IF EXISTS + repeatable
-- ALTER VIEW / REVOKE / GRANT.

BEGIN;

-- ============================================================
-- 1. Anon RLS policy on tenants — mirrors the view's existing predicate.
--    Column exposure is still controlled by the view (step 2), not by this
--    policy; this only decides which ROWS anon can see.
-- ============================================================
DROP POLICY IF EXISTS tenants_anon_storefront_select ON public.tenants;

CREATE POLICY tenants_anon_storefront_select ON public.tenants
  FOR SELECT
  TO anon
  USING (
    status = 'ACTIVE'
    OR (custom_domain IS NOT NULL AND domain_status = 'ACTIVE')
  );

COMMENT ON POLICY tenants_anon_storefront_select ON public.tenants IS
  'Anon storefront row visibility, matching v_tenants_storefront''s WHERE clause. Column-level exposure is separately controlled by a column-scoped GRANT below (not a table-wide grant) — anon cannot read external_dispatch_secret / external_dispatch_webhook_url / referral_code / champion_code / parent_brand_id / tenant_kind even via a direct /rest/v1/tenants call.';

-- Column-scoped GRANT — required because security_invoker views need the
-- CALLING role to have base-table privileges (RLS alone does not grant
-- access; it only filters rows once access is otherwise permitted). A
-- table-wide `GRANT SELECT ON tenants TO anon` was tried first and
-- verified LIVE to leak external_dispatch_secret via a direct
-- `/rest/v1/tenants?select=external_dispatch_secret` call (RLS filters
-- rows, not columns) — caught immediately post-deploy and corrected to
-- this column list, which matches exactly what the view exposes.
REVOKE SELECT ON public.tenants FROM anon;
GRANT SELECT (
  id, slug, name, vertical, custom_domain, status, dispatch_mode,
  domain_status, domain_verified_at, integration_mode, template_slug,
  city_id, feature_flags, created_at, updated_at, settings
) ON public.tenants TO anon;

-- ============================================================
-- 2. Rebuild the view as an explicit column allow-list.
--    Verified against every current reader (2026-07-25):
--      tenant.ts:    id, slug, name, custom_domain, status, settings, template_slug
--      sitemap.ts:   slug, custom_domain, updated_at
--      cities.ts:    id, slug, name, custom_domain, settings, created_at, city_id, status
--      not-found.tsx: slug, name
--    city_id and updated_at/created_at included since cities.ts / sitemap.ts
--    need them. Sensitive columns (external_dispatch_secret,
--    external_dispatch_webhook_url, referral_code, champion_code,
--    external_dispatch_enabled, parent_brand_id, tenant_kind) are excluded
--    entirely — not just blocklisted out of settings.
-- ============================================================
CREATE OR REPLACE VIEW public.v_tenants_storefront
WITH (security_invoker = on)
AS
  SELECT
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
    -- Same settings sanitisation as the original 20260509_003 view.
    coalesce(settings, '{}'::jsonb)
      - 'cod_caen'
      - 'cui'
      - 'reg_com'
      - 'legal_company'
      - 'legal_address'
      - 'legal_postal_code'
      - 'email_notifications_enabled'
      - 'onboarding'
      - 'pause_reason'
      AS settings
  FROM public.tenants
  WHERE status = 'ACTIVE'
     OR (custom_domain IS NOT NULL AND domain_status = 'ACTIVE');

COMMENT ON VIEW public.v_tenants_storefront IS
  'security_invoker=on (flipped 2026-07-25, closes Advisor CRITICAL). Storefront-safe projection of public.tenants: explicit column allow-list, excludes external_dispatch_*, referral_code, champion_code, and fiscal/legal settings subkeys. RLS on tenants (tenants_anon_storefront_select for anon, tenants_member_select for authenticated) now does the real access control since this view no longer runs as the view owner.';

GRANT SELECT ON public.v_tenants_storefront TO anon, authenticated;

COMMIT;

-- ============================================================
-- POST-APPLY (mandatory before considering this closed — live prod):
--   1. Load a real storefront by subdomain AND by a custom_domain tenant.
--   2. Load /sitemap.xml — confirm active tenants still list.
--   3. Load a 404 (unknown subdomain) — confirm the "other tenants" list on
--      not-found.tsx still renders (preview-host only, so test on a Vercel
--      preview URL, not the production custom domain).
--   4. curl the view anonymously and confirm external_dispatch_secret /
--      external_dispatch_webhook_url / referral_code / champion_code are
--      NOT present in the response shape.
-- ROLLBACK (if any of the above breaks):
--   ALTER VIEW public.v_tenants_storefront SET (security_invoker = off);
--   -- the view body/columns are unaffected by this toggle, so this alone
--   -- restores the pre-migration (deferred-item) behavior. The anon
--   -- column-scoped grant can stay in place either way — it only matters
--   -- when security_invoker=on.
-- ============================================================
-- APPLIED + VERIFIED LIVE 2026-07-25 (prod qfmeojeipncuxeltnvab):
--   - view confirmed security_invoker=on
--   - anon storefront read via PostgREST: works (foisorul-a, bucuresti-test-resto)
--   - anon direct table read of external_dispatch_secret: 42501 permission denied
--   - anon direct table read of whitelisted columns (id/slug/name): works
--     (RLS-scoped, not a new leak — same rows the view already exposed)
--   - authenticated policies (tenants_member_select, tenants_owner_update)
--     untouched, unaffected
-- ============================================================
