-- 20260616_009_marketplace_rls_per_role.sql
-- B2B Marketplace — per-role RLS policies + helper functions + audit trigger.
-- Builds on 20260616_006 (foundation) and 20260616_008 (SECDEF search_path standard).
--
-- Strategy: Strategy Master Plan Section 5 (B2B Marketplace) — Stream 1/9.
-- Replaces the bootstrap RESTRICTIVE DENY-all policies (from 20260616_006)
-- with per-role PERMISSIVE policies. Net effect remains least-privilege:
-- vendors see their own listings + offers on them, fleets see OPEN listings
-- and their own offers, both parties see their matches; matches are written
-- only by service_role via the marketplace-match-accept edge function.
--
-- Idempotent: every CREATE uses IF NOT EXISTS / OR REPLACE; every DROP uses
-- IF EXISTS. Safe to re-apply.
--
-- Anti-regression compliance (CLAUDE.md §5):
--   • REVOKE before GRANT (least privilege first).
--   • SECDEF helpers pin search_path = pg_catalog, public, extensions
--     (matches 20260616_008 hardening standard).
--   • Audit trigger runs SECURITY DEFINER with locked search_path.
--   • Feature flag HIR_FEATURE_MARKETPLACE_ENABLED still gates edge fns + UI;
--     this migration only opens the data plane.

-- ============================================================================
-- 0. REVOKE base privileges (least privilege first).
-- ============================================================================
REVOKE ALL ON public.marketplace_listings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.marketplace_offers   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.marketplace_matches  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 1. Drop the bootstrap DENY-all RESTRICTIVE policies from 20260616_006.
--    They are replaced below by per-role PERMISSIVE policies.
-- ============================================================================
DROP POLICY IF EXISTS "deny_all_marketplace_listings" ON public.marketplace_listings;
DROP POLICY IF EXISTS "deny_all_marketplace_offers"   ON public.marketplace_offers;
DROP POLICY IF EXISTS "deny_all_marketplace_matches"  ON public.marketplace_matches;

-- ============================================================================
-- 2. Helper SECDEF: is_tenant_member_of(p_tenant_id uuid).
--    Returns TRUE when the calling user (auth.uid()) is a row in
--    public.tenant_members for the given tenant. Used by vendor RLS policies.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_tenant_member_of(p_tenant_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_tenant_member_of(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_member_of(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_tenant_member_of(uuid) IS
  'B2B Marketplace RLS helper. TRUE if auth.uid() is a member of the given tenant. SECDEF with hardened search_path per 20260616_008.';

-- ============================================================================
-- 3. Helper SECDEF: is_fleet_owner_of(p_fleet_id uuid).
--    Returns TRUE when the calling user owns the given courier fleet.
--    Mirrors the 20260509_002 owner_user_id convention.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_fleet_owner_of(p_fleet_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courier_fleets cf
    WHERE cf.id = p_fleet_id
      AND cf.owner_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_fleet_owner_of(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_fleet_owner_of(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_fleet_owner_of(uuid) IS
  'B2B Marketplace RLS helper. TRUE if auth.uid() owns the given courier_fleets row. SECDEF with hardened search_path per 20260616_008.';

-- ============================================================================
-- 4. marketplace_listings — per-role PERMISSIVE policies.
-- ============================================================================
-- Vendor: read own listings (any status).
DROP POLICY IF EXISTS "vendor_can_read_own_listings" ON public.marketplace_listings;
CREATE POLICY "vendor_can_read_own_listings"
  ON public.marketplace_listings
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_member_of(vendor_tenant_id));

-- Fleet: read OPEN listings only (board view). PII filtering is enforced at
-- the view layer (planned: v_marketplace_listings_for_fleets in a follow-up),
-- not here — RLS is row-level, not column-level.
DROP POLICY IF EXISTS "fleet_can_read_open_listings" ON public.marketplace_listings;
CREATE POLICY "fleet_can_read_open_listings"
  ON public.marketplace_listings
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (status = 'OPEN');

-- Vendor: insert listings for tenants they belong to.
DROP POLICY IF EXISTS "vendor_can_post_listings" ON public.marketplace_listings;
CREATE POLICY "vendor_can_post_listings"
  ON public.marketplace_listings
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_tenant_member_of(vendor_tenant_id));

-- Vendor: update own listings while still in editable states.
-- MATCHED / IN_PROGRESS / COMPLETED / EXPIRED / DISPUTED are locked to RPC paths.
DROP POLICY IF EXISTS "vendor_can_modify_own_draft" ON public.marketplace_listings;
CREATE POLICY "vendor_can_modify_own_draft"
  ON public.marketplace_listings
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    public.is_tenant_member_of(vendor_tenant_id)
    AND status IN ('DRAFT', 'OPEN', 'CANCELLED')
  )
  WITH CHECK (
    public.is_tenant_member_of(vendor_tenant_id)
    AND status IN ('DRAFT', 'OPEN', 'CANCELLED')
  );

-- NO DELETE policy — listings are never hard-deleted; CANCELLED is the soft form.

-- ============================================================================
-- 5. marketplace_offers — per-role PERMISSIVE policies.
-- ============================================================================
-- Fleet: read own offers (any status, any listing).
DROP POLICY IF EXISTS "fleet_reads_own_offers" ON public.marketplace_offers;
CREATE POLICY "fleet_reads_own_offers"
  ON public.marketplace_offers
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.is_fleet_owner_of(fleet_id));

-- Vendor: read offers placed on their listings.
DROP POLICY IF EXISTS "vendor_reads_offers_on_own_listing" ON public.marketplace_offers;
CREATE POLICY "vendor_reads_offers_on_own_listing"
  ON public.marketplace_offers
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.marketplace_listings ml
      WHERE ml.id = marketplace_offers.listing_id
        AND public.is_tenant_member_of(ml.vendor_tenant_id)
    )
  );

-- Fleet: submit offers only against OPEN listings, and only for fleets they own.
DROP POLICY IF EXISTS "fleet_submits_offers" ON public.marketplace_offers;
CREATE POLICY "fleet_submits_offers"
  ON public.marketplace_offers
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_fleet_owner_of(fleet_id)
    AND EXISTS (
      SELECT 1
      FROM public.marketplace_listings ml
      WHERE ml.id = marketplace_offers.listing_id
        AND ml.status = 'OPEN'
    )
  );

-- Fleet: withdraw own PENDING offer (status → WITHDRAWN). ACCEPTED / REJECTED
-- transitions are reserved for fn_accept_marketplace_offer (service_role).
DROP POLICY IF EXISTS "fleet_can_withdraw_own_pending" ON public.marketplace_offers;
CREATE POLICY "fleet_can_withdraw_own_pending"
  ON public.marketplace_offers
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    public.is_fleet_owner_of(fleet_id)
    AND status = 'PENDING'
  )
  WITH CHECK (
    public.is_fleet_owner_of(fleet_id)
    AND status IN ('PENDING', 'WITHDRAWN')
  );

-- ============================================================================
-- 6. marketplace_matches — per-role PERMISSIVE policies.
--    Writes are reserved for service_role (via marketplace-match-accept edge fn
--    and fn_accept_marketplace_offer RPC). Both parties can read; both can
--    update for the DISPUTED status transition (covered by check below).
-- ============================================================================
-- Vendor + Fleet: read matches they participate in.
DROP POLICY IF EXISTS "match_parties_can_read" ON public.marketplace_matches;
CREATE POLICY "match_parties_can_read"
  ON public.marketplace_matches
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_fleet_owner_of(fleet_id)
    OR EXISTS (
      SELECT 1
      FROM public.marketplace_listings ml
      WHERE ml.id = marketplace_matches.listing_id
        AND public.is_tenant_member_of(ml.vendor_tenant_id)
    )
  );

-- No INSERT policy for authenticated → only service_role can insert
-- (which bypasses RLS). This is intentional: matches are atomic side-effects
-- of fn_accept_marketplace_offer, never user-driven INSERTs.

-- Both parties may UPDATE for the dispute path (status → DISPUTED, plus
-- dispute_reason). All other transitions remain RPC-only.
DROP POLICY IF EXISTS "match_parties_can_dispute" ON public.marketplace_matches;
CREATE POLICY "match_parties_can_dispute"
  ON public.marketplace_matches
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    public.is_fleet_owner_of(fleet_id)
    OR EXISTS (
      SELECT 1
      FROM public.marketplace_listings ml
      WHERE ml.id = marketplace_matches.listing_id
        AND public.is_tenant_member_of(ml.vendor_tenant_id)
    )
  )
  WITH CHECK (
    status IN ('DISPUTED')
    AND (
      public.is_fleet_owner_of(fleet_id)
      OR EXISTS (
        SELECT 1
        FROM public.marketplace_listings ml
        WHERE ml.id = marketplace_matches.listing_id
          AND public.is_tenant_member_of(ml.vendor_tenant_id)
      )
    )
  );

-- ============================================================================
-- 7. GRANT minimal column-set privileges (after REVOKE in §0).
--    SELECT/INSERT/UPDATE on listings + offers, SELECT/UPDATE on matches.
--    DELETE is never granted — soft-state via CANCELLED / DISPUTED only.
-- ============================================================================
GRANT SELECT, INSERT, UPDATE ON public.marketplace_listings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.marketplace_offers   TO authenticated;
GRANT SELECT, UPDATE          ON public.marketplace_matches TO authenticated;

-- ============================================================================
-- 8. Audit trigger: log marketplace_matches status changes to audit_log.
--    Captures both MVP transitions (RPC-driven) and the user-driven DISPUTED
--    path. Tenant-scoped via the joined listing.vendor_tenant_id so the row
--    surfaces in the vendor's existing audit_log view (20260430_003).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_log_marketplace_match_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_vendor_tenant_id uuid;
BEGIN
  -- Only log when status actually changes (no-op updates skip).
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Look up the vendor_tenant_id from the parent listing for audit_log.tenant_id.
  SELECT ml.vendor_tenant_id
    INTO v_vendor_tenant_id
    FROM public.marketplace_listings ml
   WHERE ml.id = NEW.listing_id;

  -- Defensive: skip audit row if listing somehow missing (shouldn't happen
  -- given FK, but a missing tenant_id would violate audit_log NOT NULL).
  IF v_vendor_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_log (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    v_vendor_tenant_id,
    auth.uid(),
    CASE TG_OP
      WHEN 'INSERT' THEN 'marketplace.match.created'
      WHEN 'UPDATE' THEN 'marketplace.match.status_changed'
    END,
    'marketplace_match',
    NEW.id::text,
    jsonb_build_object(
      'listing_id',       NEW.listing_id,
      'offer_id',         NEW.offer_id,
      'fleet_id',         NEW.fleet_id,
      'old_status',       CASE TG_OP WHEN 'UPDATE' THEN OLD.status ELSE NULL END,
      'new_status',       NEW.status,
      'final_price_cents', NEW.final_price_cents,
      'hir_fee_cents',    NEW.hir_fee_cents,
      'dispute_reason',   NEW.dispute_reason
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_log_marketplace_match_change() FROM PUBLIC;

COMMENT ON FUNCTION public.fn_log_marketplace_match_change() IS
  'B2B Marketplace audit hook. Writes audit_log rows on marketplace_matches INSERT and status-change UPDATEs. SECDEF with hardened search_path per 20260616_008.';

DROP TRIGGER IF EXISTS trg_log_marketplace_match_change ON public.marketplace_matches;
CREATE TRIGGER trg_log_marketplace_match_change
  AFTER INSERT OR UPDATE OF status
  ON public.marketplace_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_log_marketplace_match_change();
