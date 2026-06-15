-- ============================================================================
-- Migration: 16 of 17 Supabase Security Advisor ERROR findings (SAFE subset)
-- Project:   qfmeojeipncuxeltnvab
-- Date:      2026-06-15
--
-- Adversarial review (22 agents, 5 lenses) flagged a 5-blocker chain on the
-- original v_tenants_storefront flip — it would have either (a) broken every
-- anon storefront ("permission denied for table tenants") or (b) silently
-- exposed external_dispatch_secret + fiscal PII through a permissive RLS
-- policy. v_tenants_storefront stays SECURITY DEFINER until we ship a
-- column-scoped GRANT + anon-only policy in a follow-up migration.
--
-- This migration applies the 15 remaining view flips + marketing_calculator_
-- leads RLS, which are independently safe per the audit.
-- ============================================================================

BEGIN;

-- 1. SUPPORTING POLICY (courier_orders_feed needs courier_fleets readable
--    under security_invoker; safe — scoped to caller's own fleet via
--    courier_profiles.user_id = auth.uid()).
DROP POLICY IF EXISTS courier_fleets_member_read ON public.courier_fleets;
CREATE POLICY courier_fleets_member_read
    ON public.courier_fleets
    FOR SELECT
    TO authenticated
    USING (
        id IN (
            SELECT cp.fleet_id
            FROM public.courier_profiles cp
            WHERE cp.user_id = auth.uid()
        )
    );

COMMENT ON POLICY courier_fleets_member_read ON public.courier_fleets IS
    'Authenticated courier reads only fleets they belong to. Required so courier_orders_feed (security_invoker=on) joins courier_fleets in the courier app.';

GRANT SELECT ON public.courier_fleets TO authenticated;

-- 2. FLIP 15 SECURITY DEFINER VIEWS TO security_invoker=on
--    (v_tenants_storefront intentionally NOT included — see header)

ALTER VIEW public.v_copilot_attributed_revenue SET (security_invoker = on);
REVOKE SELECT ON public.v_copilot_attributed_revenue FROM anon, authenticated;
COMMENT ON VIEW public.v_copilot_attributed_revenue IS
    'security_invoker=on. Admin-only attribution view. Read via service_role.';

ALTER VIEW public.v_copilot_revenue_by_run SET (security_invoker = on);
REVOKE SELECT ON public.v_copilot_revenue_by_run FROM anon, authenticated;
COMMENT ON VIEW public.v_copilot_revenue_by_run IS
    'security_invoker=on. Aggregate of v_copilot_attributed_revenue. Service_role only.';

ALTER VIEW public.restaurant_review_summary SET (security_invoker = on);
COMMENT ON VIEW public.restaurant_review_summary IS
    'security_invoker=on. Inherits restaurant_reviews RLS. Tenant members see their own aggregate; service_role bypasses RLS for storefront rating pill.';

ALTER VIEW public.courier_orders_feed SET (security_invoker = on);
COMMENT ON VIEW public.courier_orders_feed IS
    'security_invoker=on. Courier app reads only rows visible under courier_orders RLS (assignee or open-in-my-fleet). Joined courier_fleets gated by courier_fleets_member_read.';

ALTER VIEW public.courier_rating_summary SET (security_invoker = on);
COMMENT ON VIEW public.courier_rating_summary IS
    'security_invoker=on. Inherits delivery_ratings RLS (courier self-read or tenant member of source_tenant_id).';

ALTER VIEW public.v_growth_cuisine_benchmark SET (security_invoker = on);
REVOKE SELECT ON public.v_growth_cuisine_benchmark FROM anon, authenticated;
COMMENT ON VIEW public.v_growth_cuisine_benchmark IS
    'security_invoker=on. Growth-agent daily cron only (service_role). No end-user grants.';

ALTER VIEW public.v_mv_refresh_status SET (security_invoker = on);
REVOKE SELECT ON public.v_mv_refresh_status FROM anon, authenticated;
COMMENT ON VIEW public.v_mv_refresh_status IS
    'security_invoker=on. Platform-admin observability only; service_role.';

ALTER VIEW public.v_user_active_roles SET (security_invoker = on);
COMMENT ON VIEW public.v_user_active_roles IS
    'security_invoker=on. Authenticated caller sees only roles derived from their own rows in partners/courier_fleets/tenant_members.';

ALTER VIEW public.v_partner_kpis SET (security_invoker = on);
REVOKE SELECT ON public.v_partner_kpis FROM anon, authenticated;
COMMENT ON VIEW public.v_partner_kpis IS
    'security_invoker=on. Service_role admin client only (/partner-portal). Add explicit GRANT + RLS on partner_referrals/partner_commissions before exposing to authenticated.';

ALTER VIEW public.v_tenant_monthly_ai_spend SET (security_invoker = on);
REVOKE SELECT ON public.v_tenant_monthly_ai_spend FROM anon, authenticated;
COMMENT ON VIEW public.v_tenant_monthly_ai_spend IS
    'security_invoker=on. Platform-admin AI spend observability; service_role only.';

ALTER VIEW public.v_lost_customers SET (security_invoker = on);
REVOKE SELECT ON public.v_lost_customers FROM anon, authenticated;
COMMENT ON VIEW public.v_lost_customers IS
    'security_invoker=on. PII (customer phone). Service_role only via /dashboard/customers/reactivation.';

ALTER VIEW public.v_courier_kpi_7d SET (security_invoker = on);
COMMENT ON VIEW public.v_courier_kpi_7d IS
    'security_invoker=on. Inherits courier_daily_kpis RLS (own-row read). Service_role bypasses for dispatch/Hepi.';

ALTER VIEW public.tenant_zone_active_pauses SET (security_invoker = on);
COMMENT ON VIEW public.tenant_zone_active_pauses IS
    'security_invoker=on. Tenant-member reads via /dashboard/zones inherit tenant_zone_pauses RLS. Anon checkout uses is_tenant_zone_paused() RPC, unaffected.';

ALTER VIEW public.tenant_brand_family SET (security_invoker = on);
REVOKE SELECT ON public.tenant_brand_family FROM anon, authenticated;
COMMENT ON VIEW public.tenant_brand_family IS
    'security_invoker=on. Admin brand-family rollup; service_role only.';

ALTER VIEW public.live_ops_telemetry SET (security_invoker = on);
REVOKE SELECT ON public.live_ops_telemetry FROM anon, authenticated;
COMMENT ON VIEW public.live_ops_telemetry IS
    'security_invoker=on. Platform-admin Control Room; service_role only (ops-alerts cron + admin observability).';

-- 3. ENABLE RLS ON public.marketing_calculator_leads
ALTER TABLE public.marketing_calculator_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_calculator_leads FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_calculator_leads_anon_insert ON public.marketing_calculator_leads;
CREATE POLICY marketing_calculator_leads_anon_insert
    ON public.marketing_calculator_leads
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

COMMENT ON POLICY marketing_calculator_leads_anon_insert ON public.marketing_calculator_leads IS
    'Public marketing calculator form: anyone can submit a lead. No SELECT/UPDATE/DELETE policy means PostgREST reads/writes other than INSERT are blocked.';

GRANT INSERT ON public.marketing_calculator_leads TO anon, authenticated;
REVOKE SELECT, UPDATE, DELETE ON public.marketing_calculator_leads FROM anon, authenticated;

COMMIT;
