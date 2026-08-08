-- =====================================================================
-- Supabase Security Hardening Migration (VETTED, idempotent, SAFE-only)
-- Project: qfmeojeipncuxeltnvab
-- Date:    2026-06-17
-- Author:  security-advisor consolidation (anti-regression §5 vetted)
--
-- APPLY VIA: Supabase Management API (database/query, transactional).
-- THEN COMMIT this exact file to:
--   c:/Users/Office HIR CEO/Desktop/AI Projects/HIR for Restaurants/supabase/migrations/
-- so repo state matches prod (avoid drift — see CLAUDE.md §5.11).
--
-- WHAT THIS FIXES (all marked safe-to-fix after body-level review):
--   1) search_path pinning on 33 functions (triggers / helpers / cron /
--      integrity guards). Pins to (pg_catalog, public). All bodies are
--      own-schema or schema-qualified cross-schema (e.g. auth.uid()),
--      so pinning does NOT break resolution.
--   2) v_marketplace_summary: flip to security_invoker + revoke anon/
--      authenticated SELECT. Marketplace is gated OFF; underlying tables
--      have authenticated-only RLS; service_role keeps working.
--   3) storage.objects: drop the broad PUBLIC SELECT (enumeration/list())
--      policies on two PUBLIC buckets (courier-avatars, menu-images).
--      Public-URL image reads bypass RLS on public buckets, so display is
--      UNAFFECTED — only anonymous LISTING/enumeration is removed.
--
-- WHAT THIS DELIBERATELY DEFERS (NOT in this migration — human review):
--   * public.v_tenants_storefront (SECDEF view, ERROR): a plain invoker
--     flip breaks every anon storefront (tenants has no anon SELECT), and a
--     blanket GRANT leaks external_dispatch_secret / webhook url / referral
--     codes via PostgREST. Requires the exact ordered chain
--     (REVOKE -> column-scoped GRANT -> anon RLS policy -> flip) PLUS a live
--     storefront smoke test. Two-blocker chain confirmed on prod. See
--     carefulList. Deferred to a dedicated, smoke-tested change.
--   * fn_check_permit_valid(uuid), fn_courier_application_count(uuid),
--     fn_fleet_tier(uuid): anon EXECUTE via the Postgres PUBLIC default.
--     Marked needs-care / not-a-real-vuln; revoking anon EXECUTE may break
--     an anon edge path or intentional marketplace browsing. Confirm with
--     product before revoking PUBLIC. Deferred.
--
-- IDEMPOTENCY: ALTER FUNCTION ... SET search_path is repeatable; ALTER VIEW
-- SET (security_invoker) is repeatable; DROP POLICY IF EXISTS guards the
-- storage policy drops. Re-applying this file is a no-op.
-- =====================================================================

BEGIN;

-- =====================================================================
-- CATEGORY 1: search_path pinning (33 functions)
-- ALTER FUNCTION ... SET search_path = pg_catalog, public;
-- Repeatable; does not alter function bodies.
-- =====================================================================

-- 1a. Generic updated_at / touch triggers
ALTER FUNCTION public.touch_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.copilot_tenant_config_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.fn_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.fn_reservations_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.feedback_reports_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.fix_attempts_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.tenant_onboarding_drafts_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.smartbill_invoice_jobs_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.fleet_alloc_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.public_incidents_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.city_events_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.cs_agent_responses_touch_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.partner_sponsors_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.reseller_leads_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.champion_referrals_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.courier_shift_slots_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.touch_content_brand_contexts_updated_at() SET search_path = pg_catalog, public;

-- 1b. Guard / immutability / integrity triggers
ALTER FUNCTION public.fn_courier_fleet_allowed_verticals_guard() SET search_path = pg_catalog, public;
ALTER FUNCTION public.tenants_prevent_unguarded_delete() SET search_path = pg_catalog, public;
ALTER FUNCTION public.tenants_enforce_flat_brand_hierarchy() SET search_path = pg_catalog, public;
ALTER FUNCTION public.guard_content_drafts_member_update() SET search_path = pg_catalog, public;
ALTER FUNCTION public.platform_order_events_immutable() SET search_path = pg_catalog, public;

-- 1c. Audit-log hash-chain (integrity-sensitive).
--     CRITICAL (refute: breakage): audit_log_compute_hash() + audit_log_verify_chain()
--     call digest() which lives in the `extensions` schema on this project (pgcrypto),
--     NOT pg_catalog. Their pin MUST include `extensions` or the audit_log BEFORE-INSERT
--     trigger (trg_audit_log_chain) throws on EVERY insert -> breaks signup/dispatch/
--     permit-verify/pfa-pool/hepi/fleet-allocation/courier-mirror/whatsapp platform-wide.
--     canonical_payload has no digest call -> pg_catalog, public is fine.
ALTER FUNCTION public.audit_log_canonical_payload(uuid, uuid, uuid, text, text, text, jsonb, timestamptz) SET search_path = pg_catalog, public;
ALTER FUNCTION public.audit_log_compute_hash() SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.audit_log_verify_chain(timestamptz, timestamptz) SET search_path = pg_catalog, public, extensions;

-- 1d. Stamping triggers (tenant_id / fleet / lifecycle)
ALTER FUNCTION public.order_messages_set_tenant_id() SET search_path = pg_catalog, public;
ALTER FUNCTION public.stamp_courier_lifecycle_timestamps() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_deletion_request_fleet() SET search_path = pg_catalog, public;

-- 1e. Helpers (STABLE/pure, own-schema/builtins or schema-qualified)
ALTER FUNCTION public.brand_root_id(uuid) SET search_path = pg_catalog, public;

-- 1f. Cron / batch functions
ALTER FUNCTION public.revoke_expired_courier_offers() SET search_path = pg_catalog, public;
ALTER FUNCTION public.rollup_courier_daily_kpis(date) SET search_path = pg_catalog, public;
ALTER FUNCTION public.purge_due_courier_deletions() SET search_path = pg_catalog, public;

-- =====================================================================
-- CATEGORY 2: SECURITY DEFINER view -> security_invoker (safe-sequenced)
-- v_marketplace_summary: diagnostic COUNT(*) rollup; marketplace gated OFF.
-- Underlying 3 tables have RLS enabled, authenticated-only policies, no anon
-- grant. service_role bypasses RLS (real reader) -> unaffected. Removing
-- anon/authenticated SELECT eliminates unnecessary anon aggregate exposure.
-- REVOKE-before-flip is harmless here; flip is idempotent.
-- =====================================================================
ALTER VIEW public.v_marketplace_summary SET (security_invoker = on);
REVOKE SELECT ON public.v_marketplace_summary FROM anon, authenticated;

-- =====================================================================
-- CATEGORY 3: public storage buckets — remove anonymous enumeration/list()
-- Both buckets are PUBLIC: object reads via /object/public/<key> bypass RLS,
-- so dropping the broad PUBLIC SELECT removes ONLY anonymous LISTING.
-- No .list() usage exists in the codebase. Image display is unaffected.
-- DROP IF EXISTS = idempotent; NOT recreated (intentional removal).
-- =====================================================================

-- courier-avatars: paths {auth.uid()}/avatar-*.ext — listing leaked the set
-- of courier auth.uid() values to anon.
DROP POLICY IF EXISTS "courier_avatars_public_read" ON storage.objects;

-- menu-images: paths {tenant_id}/{item_id}.ext — listing leaked every
-- tenant_id and the full cross-tenant menu inventory to anon.
DROP POLICY IF EXISTS "menu_images_public_read" ON storage.objects;

-- tenant-branding: same broad PUBLIC SELECT pattern (refute: leak omission).
-- public=true bucket -> getPublicUrl reads bypass RLS, display unaffected;
-- dropping the broad policy removes only anon enumeration of every tenant_id.
DROP POLICY IF EXISTS "tenant_branding_public_read" ON storage.objects;

COMMIT;

-- =====================================================================
-- ROLLBACK NOTES (manual, if regression observed):
--   * search_path: ALTER FUNCTION ... RESET search_path;
--   * v_marketplace_summary: ALTER VIEW ... SET (security_invoker = off);
--       GRANT SELECT ON public.v_marketplace_summary TO anon, authenticated;
--   * storage policies: re-CREATE the original PUBLIC SELECT policies only if
--       a real anon list() dependency surfaces (none found in codebase).
-- POST-APPLY: run scripts/smoke-post-deploy.sh; confirm storefront images,
--   courier avatars, and menu images still render (public-URL reads).
-- =====================================================================
