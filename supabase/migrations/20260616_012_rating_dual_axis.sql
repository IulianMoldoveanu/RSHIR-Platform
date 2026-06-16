-- 20260616_012_rating_dual_axis.sql
-- B2B Marketplace — Rating dual-axis (Stream SCHEMA-3).
-- Per Board Verdict §11.1 of Open Marketplace Extensions plan.
--
-- Adds the rating/reputation data plane for marketplace_matches:
--   • driver_scores         — Bolt-style rolling 100-delivery score per courier
--   • vendor_nps_ratings    — vendor→fleet 1-5 rating with 1-in-5 random sampling
--   • fleet_aggregate_scores — rolling 30d aggregate, auto-pause < 3.8
--   • fn_recalc_driver_score / fn_recalc_fleet_aggregate — SECDEF recompute helpers
--   • fn_fleet_tier — Gold/Silver/Bronze mapping (PUBLIC tier, not raw numeric)
--   • Trigger AFTER UPDATE on marketplace_matches (DELIVERED|DISPUTED) → recompute
--   • Anti-gaming cluster detection on vendor_nps_ratings (>3 same IP+device+target)
--
-- Idempotent: every CREATE uses IF NOT EXISTS / OR REPLACE; every DROP uses
-- IF EXISTS. Safe to re-apply.
--
-- Anti-regression compliance (CLAUDE.md §5):
--   • REVOKE before GRANT (least privilege first).
--   • SECDEF helpers pin search_path = pg_catalog, public, extensions
--     (matches 20260616_008 hardening standard).
--   • Per-role PERMISSIVE RLS: courier sees own score; fleet owner sees own
--     aggregate; vendor sees anonymized cross-fleet view (tier only, not score);
--     service_role bypass for recompute.
--   • Feature flag HIR_FEATURE_MARKETPLACE_DUAL_RATING_ENABLED gates edge fns +
--     UI; this migration only opens the data plane (default OFF in app code).

-- ============================================================================
-- 1. TABLE: driver_scores — rolling 100-delivery score per courier (Bolt-style).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.driver_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_user_id uuid NOT NULL,
  score numeric(5,2) NOT NULL DEFAULT 50.00 CHECK (score BETWEEN 0 AND 100),
  breakdown jsonb NOT NULL DEFAULT jsonb_build_object(
    'accept_rate', 0,
    'on_time_rate', 0,
    'completion_rate', 0,
    'cancellation_rate', 0,
    'counts', jsonb_build_object(
      'accepted', 0,
      'on_time', 0,
      'completed', 0,
      'cancelled', 0,
      'total', 0
    )
  ),
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  rolling_window_count int NOT NULL DEFAULT 100 CHECK (rolling_window_count > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_scores_courier_unique UNIQUE (courier_user_id)
);

COMMENT ON TABLE public.driver_scores IS
  'Stream SCHEMA-3 (20260616_012). Bolt-style rolling 100-delivery driver reputation. NOT YET LIVE; gated by HIR_FEATURE_MARKETPLACE_DUAL_RATING_ENABLED at app layer.';
COMMENT ON COLUMN public.driver_scores.score IS
  'Composite 0..100. Public surface should expose tier from fn_fleet_tier-equivalent only.';
COMMENT ON COLUMN public.driver_scores.breakdown IS
  'jsonb { accept_rate, on_time_rate, completion_rate, cancellation_rate, counts:{accepted,on_time,completed,cancelled,total} }.';

CREATE INDEX IF NOT EXISTS ix_driver_scores_courier_user_id
  ON public.driver_scores(courier_user_id);

-- ============================================================================
-- 2. TABLE: vendor_nps_ratings — vendor→fleet 1-5 with 1-in-5 random sampling.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.vendor_nps_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
  vendor_tenant_id uuid NOT NULL,
  fleet_id uuid NOT NULL,
  match_id uuid REFERENCES public.marketplace_matches(id) ON DELETE SET NULL,
  score int NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment text,
  random_sampled boolean NOT NULL DEFAULT FALSE,
  -- Anti-gaming forensics (populated by edge fn; nullable for back-compat).
  rater_ip_hash text,
  rater_device_hash text,
  flagged_cluster boolean NOT NULL DEFAULT FALSE,
  flagged_at timestamptz,
  flagged_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vendor_nps_ratings IS
  'Stream SCHEMA-3 (20260616_012). Vendor-to-fleet 1-5 NPS-style rating. 1-in-5 random sampling (random_sampled=true) to fight survey fatigue. Anti-gaming: rater_ip_hash + rater_device_hash hashed at edge.';
COMMENT ON COLUMN public.vendor_nps_ratings.random_sampled IS
  'TRUE when the edge fn surfaced the prompt under the 1-in-5 sampling rule (anti-fatigue). FALSE means the rating was unsolicited (e.g. dispute path).';
COMMENT ON COLUMN public.vendor_nps_ratings.flagged_cluster IS
  'Set by fn_detect_nps_cluster (anti-gaming). Same vendor+IP+device downvoting same fleet > 3x in window → flagged_cluster=true; excluded from fleet_aggregate_scores.';

CREATE INDEX IF NOT EXISTS ix_vendor_nps_ratings_fleet
  ON public.vendor_nps_ratings(fleet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_vendor_nps_ratings_vendor
  ON public.vendor_nps_ratings(vendor_tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_vendor_nps_ratings_match
  ON public.vendor_nps_ratings(match_id);

-- ============================================================================
-- 3. TABLE: fleet_aggregate_scores — rolling 30d aggregate, auto-pause < 3.8.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fleet_aggregate_scores (
  fleet_id uuid PRIMARY KEY,
  avg_rating numeric(3,2),
  on_time_pct numeric(5,2),
  dispute_count int NOT NULL DEFAULT 0,
  total_matches int NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  auto_paused_at timestamptz,
  auto_pause_reason text
);

COMMENT ON TABLE public.fleet_aggregate_scores IS
  'Stream SCHEMA-3 (20260616_012). Rolling-30d aggregate per fleet. Auto-pause when avg_rating < 3.80 over >= 10 matches (auto_paused_at set by fn_recalc_fleet_aggregate). Public marketplace surface exposes fn_fleet_tier (Gold/Silver/Bronze) only.';
COMMENT ON COLUMN public.fleet_aggregate_scores.auto_pause_reason IS
  'Free-text reason set when auto_paused_at flips non-NULL (e.g. "avg_rating 3.62 < 3.80 over 14 matches in 30d").';

CREATE INDEX IF NOT EXISTS ix_fleet_aggregate_scores_paused
  ON public.fleet_aggregate_scores(auto_paused_at)
  WHERE auto_paused_at IS NOT NULL;

-- ============================================================================
-- 4. REVOKE base privileges on all 3 new tables (least privilege first).
-- ============================================================================
REVOKE ALL ON public.driver_scores          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.vendor_nps_ratings     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fleet_aggregate_scores FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. SECDEF: fn_recalc_driver_score(p_courier_user_id uuid).
--    Recomputes the rolling-100 score from marketplace_matches joined to
--    marketplace_offers (last 100 DELIVERED|DISPUTED|CANCELLED matches for the
--    courier's fleet where the courier was the assigned driver).
--    UPSERT into driver_scores.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_recalc_driver_score(p_courier_user_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_total           int  := 0;
  v_completed       int  := 0;
  v_cancelled       int  := 0;
  v_on_time         int  := 0;
  v_accepted        int  := 0;
  v_accept_rate     numeric := 0;
  v_on_time_rate    numeric := 0;
  v_completion_rate numeric := 0;
  v_cancel_rate     numeric := 0;
  v_score           numeric := 50.00;
BEGIN
  -- Pull last 100 marketplace_matches for this courier via courier_orders bridge.
  -- We rely on marketplace_matches.courier_order_id → courier_orders.courier_user_id.
  WITH last_window AS (
    SELECT mm.id, mm.status, mm.matched_at, mm.updated_at, co.delivered_at, co.accepted_at, co.cancelled_at
      FROM public.marketplace_matches mm
      JOIN public.courier_orders co ON co.id = mm.courier_order_id
     WHERE co.courier_user_id = p_courier_user_id
       AND mm.status IN ('DELIVERED','CANCELLED','DISPUTED')
     ORDER BY mm.matched_at DESC
     LIMIT 100
  )
  SELECT
    COUNT(*)                                                                AS total,
    COUNT(*) FILTER (WHERE status = 'DELIVERED')                            AS completed,
    COUNT(*) FILTER (WHERE status = 'CANCELLED')                            AS cancelled,
    COUNT(*) FILTER (WHERE status = 'DELIVERED' AND delivered_at IS NOT NULL AND delivered_at <= matched_at + interval '60 minutes') AS on_time,
    COUNT(*) FILTER (WHERE accepted_at IS NOT NULL)                         AS accepted
  INTO v_total, v_completed, v_cancelled, v_on_time, v_accepted
  FROM last_window;

  IF v_total > 0 THEN
    v_accept_rate     := (v_accepted::numeric  / v_total::numeric);
    v_on_time_rate    := (v_on_time::numeric   / v_total::numeric);
    v_completion_rate := (v_completed::numeric / v_total::numeric);
    v_cancel_rate     := (v_cancelled::numeric / v_total::numeric);

    -- Composite score (Bolt-inspired weights). 0..100.
    --   40% completion, 30% on-time, 20% accept, 10% (1 - cancel).
    v_score := ROUND(
      (v_completion_rate * 40
     + v_on_time_rate    * 30
     + v_accept_rate     * 20
     + (1 - v_cancel_rate) * 10)::numeric
    , 2);
    -- Clamp.
    IF v_score < 0   THEN v_score := 0;   END IF;
    IF v_score > 100 THEN v_score := 100; END IF;
  ELSE
    -- No window data → seed at neutral 50.
    v_score := 50.00;
  END IF;

  INSERT INTO public.driver_scores (
    courier_user_id, score, breakdown, last_calculated_at, rolling_window_count, updated_at
  ) VALUES (
    p_courier_user_id,
    v_score,
    jsonb_build_object(
      'accept_rate',       v_accept_rate,
      'on_time_rate',      v_on_time_rate,
      'completion_rate',   v_completion_rate,
      'cancellation_rate', v_cancel_rate,
      'counts', jsonb_build_object(
        'accepted',  v_accepted,
        'on_time',   v_on_time,
        'completed', v_completed,
        'cancelled', v_cancelled,
        'total',     v_total
      )
    ),
    now(),
    100,
    now()
  )
  ON CONFLICT (courier_user_id) DO UPDATE
    SET score                = EXCLUDED.score,
        breakdown            = EXCLUDED.breakdown,
        last_calculated_at   = EXCLUDED.last_calculated_at,
        rolling_window_count = EXCLUDED.rolling_window_count,
        updated_at           = now();
END;
$$;

REVOKE ALL ON FUNCTION public.fn_recalc_driver_score(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_recalc_driver_score(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_recalc_driver_score(uuid) IS
  'Stream SCHEMA-3. Recomputes rolling-100 composite score from marketplace_matches+courier_orders. Bolt-style weights: 40% completion / 30% on-time / 20% accept / 10% (1-cancel). UPSERT into driver_scores. SECDEF, hardened search_path.';

-- ============================================================================
-- 6. SECDEF: fn_recalc_fleet_aggregate(p_fleet_id uuid).
--    Recomputes 30-day aggregate from vendor_nps_ratings + marketplace_matches.
--    Auto-pauses fleet when avg_rating < 3.80 over >= 10 matches in 30d.
--    Excludes flagged_cluster=true ratings (anti-gaming).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_recalc_fleet_aggregate(p_fleet_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_avg_rating    numeric(3,2);
  v_on_time_pct   numeric(5,2) := 0;
  v_dispute_count int := 0;
  v_total_matches int := 0;
  v_rating_count  int := 0;
  v_auto_pause    timestamptz := NULL;
  v_auto_reason   text := NULL;
BEGIN
  -- Average rating over rolling 30 days, excluding flagged anti-gaming clusters.
  SELECT AVG(score)::numeric(3,2), COUNT(*)
    INTO v_avg_rating, v_rating_count
    FROM public.vendor_nps_ratings
   WHERE fleet_id = p_fleet_id
     AND flagged_cluster = FALSE
     AND created_at >= now() - interval '30 days';

  -- Match stats over rolling 30 days.
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'DISPUTED'),
    COALESCE(
      100.0 * COUNT(*) FILTER (
        WHERE status = 'DELIVERED'
          AND EXISTS (
            SELECT 1 FROM public.courier_orders co
             WHERE co.id = marketplace_matches.courier_order_id
               AND co.delivered_at IS NOT NULL
               AND co.delivered_at <= marketplace_matches.matched_at + interval '60 minutes'
          )
      ) / NULLIF(COUNT(*) FILTER (WHERE status = 'DELIVERED'), 0)::numeric
    , 0)
  INTO v_total_matches, v_dispute_count, v_on_time_pct
  FROM public.marketplace_matches
  WHERE fleet_id = p_fleet_id
    AND matched_at >= now() - interval '30 days';

  -- Auto-pause rule: avg_rating < 3.80 over >= 10 matches in window.
  IF v_avg_rating IS NOT NULL
     AND v_avg_rating < 3.80
     AND v_total_matches >= 10
  THEN
    v_auto_pause  := now();
    v_auto_reason := 'avg_rating ' || v_avg_rating::text
                     || ' < 3.80 over ' || v_total_matches::text
                     || ' matches in 30d';
  END IF;

  INSERT INTO public.fleet_aggregate_scores (
    fleet_id, avg_rating, on_time_pct, dispute_count, total_matches,
    calculated_at, auto_paused_at, auto_pause_reason
  ) VALUES (
    p_fleet_id,
    v_avg_rating,
    v_on_time_pct,
    v_dispute_count,
    v_total_matches,
    now(),
    v_auto_pause,
    v_auto_reason
  )
  ON CONFLICT (fleet_id) DO UPDATE
    SET avg_rating        = EXCLUDED.avg_rating,
        on_time_pct       = EXCLUDED.on_time_pct,
        dispute_count     = EXCLUDED.dispute_count,
        total_matches     = EXCLUDED.total_matches,
        calculated_at     = EXCLUDED.calculated_at,
        -- Sticky auto-pause: do not auto-clear; ops must unpause manually.
        auto_paused_at    = COALESCE(public.fleet_aggregate_scores.auto_paused_at, EXCLUDED.auto_paused_at),
        auto_pause_reason = COALESCE(public.fleet_aggregate_scores.auto_pause_reason, EXCLUDED.auto_pause_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_recalc_fleet_aggregate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_recalc_fleet_aggregate(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_recalc_fleet_aggregate(uuid) IS
  'Stream SCHEMA-3. Recomputes rolling-30d fleet aggregate. Auto-pause when avg_rating<3.80 over>=10 matches. Excludes flagged_cluster ratings. Sticky pause (ops must clear). SECDEF, hardened search_path.';

-- ============================================================================
-- 7. SECDEF: fn_fleet_tier(p_fleet_id uuid) → Gold/Silver/Bronze/Unrated.
--    Public-safe wrapper: exposes tier band only, NOT raw numeric score.
--    Per board verdict: "Gold/Silver/Bronze visible public, NOT numeric directly".
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_fleet_tier(p_fleet_id uuid)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
AS $$
  SELECT CASE
           WHEN fas.avg_rating IS NULL THEN 'Unrated'
           WHEN fas.avg_rating >= 4.50 THEN 'Gold'
           WHEN fas.avg_rating >= 4.00 THEN 'Silver'
           WHEN fas.avg_rating >= 3.50 THEN 'Bronze'
           ELSE 'Probation'
         END
    FROM public.fleet_aggregate_scores fas
   WHERE fas.fleet_id = p_fleet_id;
$$;

REVOKE ALL ON FUNCTION public.fn_fleet_tier(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fleet_tier(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_fleet_tier(uuid) IS
  'Stream SCHEMA-3. Public-safe tier band derived from avg_rating: Gold>=4.5 / Silver>=4.0 / Bronze>=3.5 / Probation<3.5 / Unrated=null. Exposes tier, NEVER raw score (board verdict).';

-- ============================================================================
-- 8. SECDEF: fn_detect_nps_cluster() — anti-gaming.
--    Flags rows where the same vendor_tenant_id + rater_ip_hash + rater_device_hash
--    downvoted (score <= 2) the same fleet_id more than 3 times in 7 days.
--    Trigger fires BEFORE INSERT on vendor_nps_ratings.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_detect_nps_cluster()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_cluster_count int := 0;
BEGIN
  -- Only meaningful when forensics fields populated and score is downvote-class.
  IF NEW.rater_ip_hash IS NULL
     OR NEW.rater_device_hash IS NULL
     OR NEW.score > 2
  THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
    INTO v_cluster_count
    FROM public.vendor_nps_ratings
   WHERE vendor_tenant_id = NEW.vendor_tenant_id
     AND fleet_id         = NEW.fleet_id
     AND rater_ip_hash    = NEW.rater_ip_hash
     AND rater_device_hash = NEW.rater_device_hash
     AND score <= 2
     AND created_at >= now() - interval '7 days';

  IF v_cluster_count >= 3 THEN
    NEW.flagged_cluster := TRUE;
    NEW.flagged_at      := now();
    NEW.flagged_reason  := 'Cluster: same vendor+ip+device downvoted same fleet '
                           || (v_cluster_count + 1)::text || 'x in 7d';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_detect_nps_cluster() FROM PUBLIC;

COMMENT ON FUNCTION public.fn_detect_nps_cluster() IS
  'Stream SCHEMA-3. Anti-gaming: BEFORE INSERT on vendor_nps_ratings. Flags clusters of >3 same-vendor+ip+device downvotes (score<=2) of same fleet in 7d. flagged_cluster=true rows are excluded from fn_recalc_fleet_aggregate.';

DROP TRIGGER IF EXISTS trg_detect_nps_cluster ON public.vendor_nps_ratings;
CREATE TRIGGER trg_detect_nps_cluster
  BEFORE INSERT
  ON public.vendor_nps_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_detect_nps_cluster();

-- ============================================================================
-- 9. SECDEF: fn_marketplace_match_rating_recalc() — recompute trigger.
--    AFTER UPDATE on marketplace_matches when status transitions to
--    DELIVERED or DISPUTED → recompute fleet aggregate + driver score.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_marketplace_match_rating_recalc()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_courier_user_id uuid;
BEGIN
  -- Only fire on transitions INTO DELIVERED or DISPUTED.
  IF NEW.status NOT IN ('DELIVERED','DISPUTED') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Recompute fleet aggregate (always).
  PERFORM public.fn_recalc_fleet_aggregate(NEW.fleet_id);

  -- Recompute driver score if we can resolve the courier from courier_orders.
  IF NEW.courier_order_id IS NOT NULL THEN
    SELECT co.courier_user_id
      INTO v_courier_user_id
      FROM public.courier_orders co
     WHERE co.id = NEW.courier_order_id;

    IF v_courier_user_id IS NOT NULL THEN
      PERFORM public.fn_recalc_driver_score(v_courier_user_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_marketplace_match_rating_recalc() FROM PUBLIC;

COMMENT ON FUNCTION public.fn_marketplace_match_rating_recalc() IS
  'Stream SCHEMA-3. AFTER UPDATE trigger on marketplace_matches: when status → DELIVERED or DISPUTED, recompute fleet_aggregate_scores and driver_scores. SECDEF, hardened search_path.';

DROP TRIGGER IF EXISTS trg_marketplace_match_rating_recalc ON public.marketplace_matches;
CREATE TRIGGER trg_marketplace_match_rating_recalc
  AFTER UPDATE OF status
  ON public.marketplace_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_marketplace_match_rating_recalc();

-- ============================================================================
-- 10. RLS policies — per-role least-privilege.
--     • driver_scores: courier sees OWN row only; service_role bypass.
--     • vendor_nps_ratings: vendor INSERTs/SELECTs own rows (is_tenant_member_of);
--                           fleet owner SELECTs ratings of their own fleet.
--     • fleet_aggregate_scores: fleet owner SELECTs OWN row; vendor SELECTs
--                               anonymized tier-only via fn_fleet_tier (no
--                               direct table grant to vendor).
-- ============================================================================
ALTER TABLE public.driver_scores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_nps_ratings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_aggregate_scores ENABLE ROW LEVEL SECURITY;

-- driver_scores: own courier read.
DROP POLICY IF EXISTS "courier_reads_own_driver_score" ON public.driver_scores;
CREATE POLICY "courier_reads_own_driver_score"
  ON public.driver_scores
  FOR SELECT
  TO authenticated
  USING (courier_user_id = auth.uid());

-- vendor_nps_ratings: vendor inserts own (vendor_tenant_id membership).
DROP POLICY IF EXISTS "vendor_inserts_own_nps_rating" ON public.vendor_nps_ratings;
CREATE POLICY "vendor_inserts_own_nps_rating"
  ON public.vendor_nps_ratings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_tenant_member_of(vendor_tenant_id));

-- vendor_nps_ratings: vendor reads own (rows they submitted).
DROP POLICY IF EXISTS "vendor_reads_own_nps_ratings" ON public.vendor_nps_ratings;
CREATE POLICY "vendor_reads_own_nps_ratings"
  ON public.vendor_nps_ratings
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_member_of(vendor_tenant_id));

-- vendor_nps_ratings: fleet owner reads ratings about own fleet.
DROP POLICY IF EXISTS "fleet_reads_own_nps_ratings" ON public.vendor_nps_ratings;
CREATE POLICY "fleet_reads_own_nps_ratings"
  ON public.vendor_nps_ratings
  FOR SELECT
  TO authenticated
  USING (public.is_fleet_owner_of(fleet_id));

-- fleet_aggregate_scores: fleet owner reads OWN aggregate (raw numeric).
DROP POLICY IF EXISTS "fleet_reads_own_aggregate_score" ON public.fleet_aggregate_scores;
CREATE POLICY "fleet_reads_own_aggregate_score"
  ON public.fleet_aggregate_scores
  FOR SELECT
  TO authenticated
  USING (public.is_fleet_owner_of(fleet_id));

-- NOTE: vendors do NOT get direct SELECT on fleet_aggregate_scores.
-- Cross-fleet visibility goes through fn_fleet_tier (tier-only, board verdict).

-- ============================================================================
-- 11. GRANT minimal column-set privileges (after REVOKE in §4).
-- ============================================================================
GRANT SELECT                 ON public.driver_scores          TO authenticated;
GRANT SELECT, INSERT         ON public.vendor_nps_ratings     TO authenticated;
GRANT SELECT                 ON public.fleet_aggregate_scores TO authenticated;

-- ============================================================================
-- 12. Audit hook: log dispute/auto-pause-significant aggregate changes.
--     Piggybacks on existing audit_log shape (see fn_log_marketplace_match_change).
--     Logs every NEW vendor_nps_ratings row to keep a tamper-evident trail
--     for cluster-flagged disputes.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_log_vendor_nps_rating()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  INSERT INTO public.audit_log (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    NEW.vendor_tenant_id,
    auth.uid(),
    'marketplace.rating.nps_submitted',
    'vendor_nps_rating',
    NEW.id::text,
    jsonb_build_object(
      'fleet_id',        NEW.fleet_id,
      'listing_id',      NEW.listing_id,
      'match_id',        NEW.match_id,
      'score',           NEW.score,
      'random_sampled',  NEW.random_sampled,
      'flagged_cluster', NEW.flagged_cluster,
      'flagged_reason',  NEW.flagged_reason
    )
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_log_vendor_nps_rating() FROM PUBLIC;

COMMENT ON FUNCTION public.fn_log_vendor_nps_rating() IS
  'Stream SCHEMA-3. Audit hook: every INSERT into vendor_nps_ratings produces an audit_log row tenant-scoped to vendor_tenant_id. SECDEF, hardened search_path.';

DROP TRIGGER IF EXISTS trg_log_vendor_nps_rating ON public.vendor_nps_ratings;
CREATE TRIGGER trg_log_vendor_nps_rating
  AFTER INSERT
  ON public.vendor_nps_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_log_vendor_nps_rating();
