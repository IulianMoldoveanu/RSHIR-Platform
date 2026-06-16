-- B2B Marketplace foundation 2026-06-16
-- NOT YET LIVE. Gated by feature flag HIR_FEATURE_MARKETPLACE_ENABLED.
-- Strategy Master Plan Section 5 (B2B Marketplace).
-- Idempotent: safe to re-apply.
-- RLS: DENY all anon + authenticated. Service_role bypasses RLS naturally.
-- Naming: vendor_tenant_id (multi-vendor convention, NOT restaurant_tenant_id).

-- ============================================================================
-- TABLE: marketplace_listings
-- ============================================================================
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_tenant_id uuid NOT NULL,
  vertical text NOT NULL DEFAULT 'restaurant',
  city_id uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  delivery_window_start timestamptz NOT NULL,
  delivery_window_end timestamptz NOT NULL,
  pickup_address jsonb NOT NULL,
  dropoff_address jsonb NOT NULL,
  package_description text,
  package_weight_grams int,
  package_temperature text,
  customer_phone_redacted text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','OPEN','MATCHED','IN_PROGRESS','COMPLETED','CANCELLED','EXPIRED','DISPUTED')),
  is_financial_record boolean NOT NULL DEFAULT FALSE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE marketplace_listings IS
  'B2B Marketplace foundation 2026-06-16. NOT YET LIVE. Gated by feature flag HIR_FEATURE_MARKETPLACE_ENABLED. Strategy Master Plan Section 5.';
COMMENT ON COLUMN marketplace_listings.is_financial_record IS
  'Per Faza A. Flip TRUE when status moves to MATCHED+ (fiscal record kicks in at match).';
COMMENT ON COLUMN marketplace_listings.vendor_tenant_id IS
  'Multi-vendor: any tenant (restaurant|pharmacy|retail|other).';

-- ============================================================================
-- TABLE: marketplace_offers
-- ============================================================================
CREATE TABLE IF NOT EXISTS marketplace_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  fleet_id uuid NOT NULL,
  offered_price_cents int NOT NULL CHECK (offered_price_cents >= 0),
  eta_minutes int NOT NULL CHECK (eta_minutes >= 0),
  fleet_rating numeric(3,2),
  notes text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED','EXPIRED','WITHDRAWN')),
  expires_at timestamptz NOT NULL,
  is_financial_record boolean NOT NULL DEFAULT FALSE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_offers_listing_fleet_unique UNIQUE (listing_id, fleet_id)
);

COMMENT ON TABLE marketplace_offers IS
  'B2B Marketplace foundation 2026-06-16. NOT YET LIVE. Fleet bids on listings.';
COMMENT ON COLUMN marketplace_offers.fleet_id IS
  'References courier_fleets(id). No FK to allow stub/seed data during build-out.';

-- ============================================================================
-- TABLE: marketplace_matches
-- ============================================================================
CREATE TABLE IF NOT EXISTS marketplace_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id),
  offer_id uuid NOT NULL REFERENCES marketplace_offers(id),
  fleet_id uuid NOT NULL,
  matched_at timestamptz NOT NULL DEFAULT now(),
  courier_order_id uuid,
  status text NOT NULL DEFAULT 'MATCHED' CHECK (status IN ('MATCHED','IN_PROGRESS','DELIVERED','CANCELLED','DISPUTED','REFUNDED')),
  final_price_cents int NOT NULL,
  hir_fee_cents int NOT NULL DEFAULT 100,
  dispute_reason text,
  is_financial_record boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_matches_listing_unique UNIQUE (listing_id)
);

COMMENT ON TABLE marketplace_matches IS
  'B2B Marketplace foundation 2026-06-16. NOT YET LIVE. Accepted match = fiscal record (is_financial_record DEFAULT TRUE).';
COMMENT ON COLUMN marketplace_matches.courier_order_id IS
  'Link to existing courier_orders pool when wired post-MVP greenlight.';
COMMENT ON COLUMN marketplace_matches.hir_fee_cents IS
  '1 RON default per Iulian directive (100 cents).';

-- ============================================================================
-- INDICES
-- ============================================================================
CREATE INDEX IF NOT EXISTS ix_marketplace_listings_status_city
  ON marketplace_listings (status, city_id)
  WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS ix_marketplace_offers_listing
  ON marketplace_offers (listing_id, status);

CREATE INDEX IF NOT EXISTS ix_marketplace_matches_courier_order
  ON marketplace_matches (courier_order_id)
  WHERE courier_order_id IS NOT NULL;

-- ============================================================================
-- RLS: ENABLE + DENY all anon/authenticated. Service_role bypasses naturally.
-- ============================================================================
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_offers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_matches  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_all_marketplace_listings" ON marketplace_listings;
CREATE POLICY "deny_all_marketplace_listings"
  ON marketplace_listings
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_all_marketplace_offers" ON marketplace_offers;
CREATE POLICY "deny_all_marketplace_offers"
  ON marketplace_offers
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_all_marketplace_matches" ON marketplace_matches;
CREATE POLICY "deny_all_marketplace_matches"
  ON marketplace_matches
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================================================
-- SUMMARY VIEW (service_role only; RLS-protected via base tables)
-- ============================================================================
CREATE OR REPLACE VIEW v_marketplace_summary AS
SELECT
  'listings'::text AS entity,
  status,
  count(*)::bigint AS n
FROM marketplace_listings
GROUP BY status
UNION ALL
SELECT
  'offers'::text AS entity,
  status,
  count(*)::bigint AS n
FROM marketplace_offers
GROUP BY status
UNION ALL
SELECT
  'matches'::text AS entity,
  status,
  count(*)::bigint AS n
FROM marketplace_matches
GROUP BY status;

COMMENT ON VIEW v_marketplace_summary IS
  'B2B Marketplace foundation 2026-06-16. Count by entity+status. Service_role only (base tables RLS-locked).';
