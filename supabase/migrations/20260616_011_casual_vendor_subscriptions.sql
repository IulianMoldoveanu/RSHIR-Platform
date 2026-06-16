-- 20260616_011_casual_vendor_subscriptions.sql
-- SCHEMA-2: Casual vendor self-serve + subscription tiers (Bursa Transporturilor pattern).
-- Stream 2 + Stream 6 (merged per board verdict §11.2 — subscription is LOCKED).
--
-- Strategy: Open Marketplace Extensions — Stream 2 (Casual vendor self-serve)
--           and Stream 6 (Subscription tiers schema).
-- NOT YET LIVE. Gated by feature flags:
--   HIR_FEATURE_CASUAL_VENDOR_ENABLED=false
--   HIR_FEATURE_SUBSCRIPTION_TIERS_ENABLED=false
--
-- Distinction:
--   FULL    = traditional tenant with full KYF + onboarding wizard (current path).
--   CASUAL  = self-serve signup with light verification (new path).
--
-- Builds on 20260616_006 (marketplace foundation), 20260616_008 (SECDEF
-- search_path standard), 20260616_009 (per-role RLS + is_tenant_member_of).
--
-- Idempotent: every CREATE uses IF NOT EXISTS / OR REPLACE; every DROP uses
-- IF EXISTS. Safe to re-apply.
--
-- Anti-regression compliance (CLAUDE.md §5):
--   • REVOKE before GRANT (least privilege first).
--   • All ALTER TABLE guarded via information_schema lookup or ADD COLUMN IF NOT EXISTS.
--   • CHECK constraints idempotent via DROP CONSTRAINT IF EXISTS + ADD.
--   • Subscription tier catalog seeded via INSERT … ON CONFLICT DO NOTHING.
--   • is_financial_record flag carried per 20260616_002 fiscal-record convention.

-- ============================================================================
-- 1. EXTEND public.tenants — add tenant_kind discriminator.
--    FULL = traditional onboarding (KYF + wizard).
--    CASUAL = self-serve light-verification signup.
-- ============================================================================
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tenant_kind text NOT NULL DEFAULT 'FULL';

-- Idempotent CHECK: drop if exists, then add.
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_tenant_kind_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_tenant_kind_check
  CHECK (tenant_kind IN ('FULL', 'CASUAL'));

COMMENT ON COLUMN public.tenants.tenant_kind IS
  'Stream 2 (2026-06-16). FULL = traditional tenant with KYF + onboarding wizard. CASUAL = self-serve with light verification. Gated by HIR_FEATURE_CASUAL_VENDOR_ENABLED.';

-- ============================================================================
-- 2. CREATE subscription_plans — catalog of available tiers.
--    Bursa Transporturilor pattern (board verdict §11.2): monthly subscription
--    locked as primary revenue model for casual + full vendors on the marketplace.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_code text NOT NULL UNIQUE,
  monthly_price_ron int NOT NULL CHECK (monthly_price_ron >= 0),
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_listings_per_month int,
  max_offers_per_month int,
  active boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_plans_tier_code_check
    CHECK (tier_code IN ('basic', 'pro', 'enterprise'))
);

COMMENT ON TABLE public.subscription_plans IS
  'Stream 6 (2026-06-16). Subscription tier catalog. Bursa Transporturilor pattern LOCKED per board verdict §11.2. Gated by HIR_FEATURE_SUBSCRIPTION_TIERS_ENABLED.';
COMMENT ON COLUMN public.subscription_plans.tier_code IS
  'Canonical tier identifier: basic | pro | enterprise. Use for FK and feature gating.';
COMMENT ON COLUMN public.subscription_plans.monthly_price_ron IS
  'Monthly subscription price in RON (whole units). Bani precision deferred to billing layer.';
COMMENT ON COLUMN public.subscription_plans.max_listings_per_month IS
  'NULL = unlimited (enterprise tier).';
COMMENT ON COLUMN public.subscription_plans.max_offers_per_month IS
  'NULL = unlimited (enterprise tier).';

-- ============================================================================
-- 3. SEED default plans — basic / pro / enterprise.
--    ON CONFLICT DO NOTHING keeps re-apply safe.
-- ============================================================================
INSERT INTO public.subscription_plans (tier_code, monthly_price_ron, features, max_listings_per_month, max_offers_per_month)
VALUES
  ('basic',
    49,
    '{"display_name":"Basic","description":"Pentru vendori ocazionali. 5 listinguri/lună, suport email."}'::jsonb,
    5,
    NULL),
  ('pro',
    199,
    '{"display_name":"Pro","description":"Pentru vendori activi. 50 listinguri/lună, suport prioritar, analytics."}'::jsonb,
    50,
    NULL),
  ('enterprise',
    499,
    '{"display_name":"Enterprise","description":"Listinguri și oferte nelimitate. SLA dedicat, API direct."}'::jsonb,
    NULL,
    NULL)
ON CONFLICT (tier_code) DO NOTHING;

-- ============================================================================
-- 4. CREATE tenant_subscriptions — vendor's active subscription record.
--    is_financial_record = TRUE per 20260616_002 convention (billing artifact).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  status text NOT NULL DEFAULT 'trial'
    CHECK (status IN ('active', 'expired', 'cancelled', 'trial')),
  active_until date NOT NULL,
  payment_status text,
  last_payment_at timestamptz,
  is_financial_record boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_subscriptions IS
  'Stream 6 (2026-06-16). Vendor subscription state. Bursa Transporturilor pattern LOCKED per board verdict §11.2. Written by service_role only (billing cron). Gated by HIR_FEATURE_SUBSCRIPTION_TIERS_ENABLED.';
COMMENT ON COLUMN public.tenant_subscriptions.is_financial_record IS
  'Per 20260616_002 fiscal-record convention. Subscription rows are billing artifacts.';
COMMENT ON COLUMN public.tenant_subscriptions.active_until IS
  'Subscription validity end date. Cron flips status → expired when active_until < CURRENT_DATE.';

-- ============================================================================
-- 5. INDICES — tenant lookup + active subscription resolution.
-- ============================================================================
CREATE INDEX IF NOT EXISTS ix_tenant_subscriptions_tenant_status
  ON public.tenant_subscriptions (tenant_id, status);

CREATE INDEX IF NOT EXISTS ix_tenant_subscriptions_active_until
  ON public.tenant_subscriptions (active_until)
  WHERE status IN ('active', 'trial');

-- ============================================================================
-- 6. RLS — vendors read their own subscription; service_role writes (cron).
-- ============================================================================

-- subscription_plans = public catalog (read-only for authenticated users).
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.subscription_plans FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "subscription_plans_read_active" ON public.subscription_plans;
CREATE POLICY "subscription_plans_read_active"
  ON public.subscription_plans
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (active = TRUE);

GRANT SELECT ON public.subscription_plans TO authenticated;
-- INSERT/UPDATE/DELETE remain service_role only (bypasses RLS naturally).

-- tenant_subscriptions = per-tenant private.
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tenant_subscriptions FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "tenant_member_reads_own_subscription" ON public.tenant_subscriptions;
CREATE POLICY "tenant_member_reads_own_subscription"
  ON public.tenant_subscriptions
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_member_of(tenant_id));

GRANT SELECT ON public.tenant_subscriptions TO authenticated;
-- INSERT/UPDATE remain service_role only (billing cron + payment webhooks).
