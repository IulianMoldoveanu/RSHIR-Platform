-- ============================================================================
-- 20260616_013 — Courier job board (fleet recruiting curieri)
-- ============================================================================
-- VISION LOCKED 2026-06-16 (Open Marketplace Extensions — Stream 5):
--   Layer 1 firewall preserved per HIR4You strategy + Dir UE 2024/2831:
--     - HIR NEVER pays the courier directly
--     - Fleet interviews + contracts the courier (employer relationship lives
--       between fleet and courier, never HIR)
--     - HIR only hosts the listings + applications (data/infra layer)
--   Fleet posts job listings (PFA / salariat / contractor positions).
--   Courier discovers OPEN listings, applies with optional CV + message.
--   Fleet reviews + transitions: PENDING -> REVIEWING -> INTERVIEWED ->
--   HIRED | REJECTED. Courier may WITHDRAW any time before HIRED.
--
-- ANTI-REGRESSION (CLAUDE.md §5):
--   - Idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
--     DROP POLICY IF EXISTS + CREATE POLICY, CREATE OR REPLACE FUNCTION,
--     DROP TRIGGER IF EXISTS + CREATE TRIGGER.
--   - REVOKE-before-GRANT on every new table (least privilege first).
--   - SECDEF helpers SET search_path = pg_catalog, public, extensions
--     (matches 20260616_008 hardening standard).
--   - No service_role write-bypass needed: courier inserts applications under
--     their own auth.uid(); fleet updates under is_fleet_owner_of(fleet_id);
--     platform admin acts via service_role (RLS bypassed by Supabase).
--   - Reuses existing helpers: public.is_fleet_owner_of(uuid) from
--     20260616_009.
--   - Rate limit: max 5 active applications per courier (PENDING + REVIEWING
--     + INTERVIEWED). Enforced by fn_courier_application_count + BEFORE INSERT
--     trigger so it cannot be bypassed by direct DB writes.
--
-- FEATURE FLAG (gates UI/edge fns, NOT schema):
--   HIR_FEATURE_COURIER_JOB_BOARD_ENABLED=false (default OFF post-migration)
--
-- CRON (deferred — schema only here):
--   fn_expire_courier_job_listings() flips OPEN -> EXPIRED when
--   expires_at < now() OR created_at < now() - interval '30 days'. Cron
--   wiring lives in a follow-up edge fn / pg_cron migration, NOT here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. courier_job_listings — fleet posts an open position
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courier_job_listings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id               uuid NOT NULL REFERENCES public.courier_fleets(id) ON DELETE CASCADE,
  city_id                uuid REFERENCES public.cities(id) ON DELETE SET NULL,
  position_title         text NOT NULL,
  description            text NOT NULL,
  requirements           text,
  salary_range_min_ron   integer,
  salary_range_max_ron   integer,
  employment_type        text NOT NULL CHECK (employment_type IN ('PFA','salariat','contractor')),
  shift_pattern          text,
  vehicle_required       text,
  languages_required     text[] NOT NULL DEFAULT ARRAY[]::text[],
  status                 text NOT NULL DEFAULT 'OPEN'
                         CHECK (status IN ('OPEN','PAUSED','CLOSED','EXPIRED')),
  expires_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT courier_job_listings_salary_range_chk
    CHECK (
      salary_range_min_ron IS NULL
      OR salary_range_max_ron IS NULL
      OR salary_range_max_ron >= salary_range_min_ron
    )
);

COMMENT ON TABLE public.courier_job_listings IS
  'Fleet-authored job postings for couriers (Layer 1 firewall: HIR hosts the ' ||
  'listing only — fleet contracts + pays the courier). employment_type one of ' ||
  'PFA / salariat / contractor; status flows OPEN -> PAUSED -> CLOSED with ' ||
  'EXPIRED set by fn_expire_courier_job_listings cron (>30d default).';

COMMENT ON COLUMN public.courier_job_listings.languages_required IS
  'Optional array of ISO 639-1 codes (e.g. {ro,en}). Empty = no requirement.';

-- ---------------------------------------------------------------------------
-- 2. courier_job_applications — courier applies to a listing
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courier_job_applications (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_listing_id         uuid NOT NULL REFERENCES public.courier_job_listings(id) ON DELETE CASCADE,
  courier_user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cv_doc_url             text,
  message                text,
  status                 text NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING','REVIEWING','INTERVIEWED','HIRED','REJECTED','WITHDRAWN')),
  applied_at             timestamptz NOT NULL DEFAULT now(),
  reviewed_at            timestamptz,
  hired_at               timestamptz,
  CONSTRAINT courier_job_applications_unique_per_listing
    UNIQUE (job_listing_id, courier_user_id)
);

COMMENT ON TABLE public.courier_job_applications IS
  'Courier applications to fleet job listings. One row per (listing, courier). ' ||
  'Status flow: PENDING -> REVIEWING -> INTERVIEWED -> HIRED | REJECTED. ' ||
  'Courier may transition own row to WITHDRAWN any time before HIRED. ' ||
  'Rate-limit: max 5 active (PENDING/REVIEWING/INTERVIEWED) per courier — ' ||
  'enforced by trg_courier_job_applications_rate_limit.';

-- ---------------------------------------------------------------------------
-- 3. Indices
-- ---------------------------------------------------------------------------
-- Board view: filter by city + status (OPEN listings per city).
CREATE INDEX IF NOT EXISTS ix_courier_job_listings_city_status
  ON public.courier_job_listings (city_id, status)
  WHERE status = 'OPEN';

-- Fleet ownership lookup + expiry sweep.
CREATE INDEX IF NOT EXISTS ix_courier_job_listings_fleet_status
  ON public.courier_job_listings (fleet_id, status);

CREATE INDEX IF NOT EXISTS ix_courier_job_listings_expires_at
  ON public.courier_job_listings (expires_at)
  WHERE status = 'OPEN';

-- Courier view: "my applications" sorted by status.
CREATE INDEX IF NOT EXISTS ix_courier_job_applications_courier_status
  ON public.courier_job_applications (courier_user_id, status);

-- Fleet view: "applications on this listing".
CREATE INDEX IF NOT EXISTS ix_courier_job_applications_listing_status
  ON public.courier_job_applications (job_listing_id, status);

-- ---------------------------------------------------------------------------
-- 4. Helper SECDEF: fn_courier_application_count(p_courier_user_id)
--    Returns count of ACTIVE applications (PENDING + REVIEWING + INTERVIEWED)
--    for a given courier. Used by rate-limit trigger AND by UI to display
--    "x / 5 active applications" badge.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_courier_application_count(p_courier_user_id uuid)
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
AS $$
  SELECT COUNT(*)::integer
    FROM public.courier_job_applications
   WHERE courier_user_id = p_courier_user_id
     AND status IN ('PENDING','REVIEWING','INTERVIEWED');
$$;

REVOKE ALL ON FUNCTION public.fn_courier_application_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_courier_application_count(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_courier_application_count(uuid) IS
  'Courier job board rate-limit helper. Returns count of ACTIVE applications ' ||
  '(PENDING/REVIEWING/INTERVIEWED) for the given courier. Used by ' ||
  'trg_courier_job_applications_rate_limit + UI badge. SECDEF with hardened ' ||
  'search_path per 20260616_008.';

-- ---------------------------------------------------------------------------
-- 5. Rate-limit trigger: max 5 active applications per courier
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_courier_application_limit()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_active integer;
BEGIN
  -- Only enforce on INSERT or on transitions INTO an active status.
  IF TG_OP = 'INSERT'
     OR (TG_OP = 'UPDATE'
         AND NEW.status IN ('PENDING','REVIEWING','INTERVIEWED')
         AND OLD.status NOT IN ('PENDING','REVIEWING','INTERVIEWED'))
  THEN
    SELECT COUNT(*)::integer
      INTO v_active
      FROM public.courier_job_applications
     WHERE courier_user_id = NEW.courier_user_id
       AND status IN ('PENDING','REVIEWING','INTERVIEWED')
       AND id <> NEW.id;

    IF v_active >= 5 THEN
      RAISE EXCEPTION
        'courier_job_applications: rate limit reached (max 5 active applications, courier_user_id=%)',
        NEW.courier_user_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_enforce_courier_application_limit() FROM PUBLIC;

COMMENT ON FUNCTION public.fn_enforce_courier_application_limit() IS
  'BEFORE INSERT/UPDATE trigger fn for courier_job_applications. Caps active ' ||
  '(PENDING/REVIEWING/INTERVIEWED) applications at 5 per courier. SECDEF with ' ||
  'hardened search_path per 20260616_008.';

DROP TRIGGER IF EXISTS trg_courier_job_applications_rate_limit
  ON public.courier_job_applications;
CREATE TRIGGER trg_courier_job_applications_rate_limit
  BEFORE INSERT OR UPDATE OF status
  ON public.courier_job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_courier_application_limit();

-- ---------------------------------------------------------------------------
-- 6. updated_at touch trigger on courier_job_listings
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_courier_job_listings_touch_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_courier_job_listings_touch_updated_at() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_courier_job_listings_touch_updated_at
  ON public.courier_job_listings;
CREATE TRIGGER trg_courier_job_listings_touch_updated_at
  BEFORE UPDATE ON public.courier_job_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_courier_job_listings_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Auto-expire helper (schema only — cron wiring is deferred)
--    Flips OPEN listings to EXPIRED when either:
--      - expires_at < now() (explicit fleet-set TTL), or
--      - created_at < now() - interval '30 days' (default 30-day window)
--    Called by a future cron edge fn / pg_cron job.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_expire_courier_job_listings()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.courier_job_listings
       SET status = 'EXPIRED'
     WHERE status = 'OPEN'
       AND (
         (expires_at IS NOT NULL AND expires_at < now())
         OR created_at < (now() - interval '30 days')
       )
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_count FROM expired;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_expire_courier_job_listings() FROM PUBLIC;
-- service_role is the only caller (cron edge fn). No GRANT to authenticated.

COMMENT ON FUNCTION public.fn_expire_courier_job_listings() IS
  'Cron-driven sweep that flips OPEN courier_job_listings to EXPIRED when ' ||
  'expires_at is past OR created_at is older than 30 days. Returns the row ' ||
  'count expired. Schema-only here; cron wiring lands in a follow-up.';

-- ---------------------------------------------------------------------------
-- 8. REVOKE base privileges (least privilege first)
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.courier_job_listings     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.courier_job_applications FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. RLS enable
-- ---------------------------------------------------------------------------
ALTER TABLE public.courier_job_listings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_job_applications ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 10. courier_job_listings — RLS policies
-- ---------------------------------------------------------------------------
-- Couriers (and any authenticated user) read OPEN listings only.
DROP POLICY IF EXISTS "courier_reads_open_listings" ON public.courier_job_listings;
CREATE POLICY "courier_reads_open_listings"
  ON public.courier_job_listings
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (status = 'OPEN');

-- Fleet owner reads own listings in any status.
DROP POLICY IF EXISTS "fleet_reads_own_listings" ON public.courier_job_listings;
CREATE POLICY "fleet_reads_own_listings"
  ON public.courier_job_listings
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.is_fleet_owner_of(fleet_id));

-- Fleet owner inserts listings only for fleets they own.
DROP POLICY IF EXISTS "fleet_creates_own_listings" ON public.courier_job_listings;
CREATE POLICY "fleet_creates_own_listings"
  ON public.courier_job_listings
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_fleet_owner_of(fleet_id));

-- Fleet owner updates own listings (status + content edits).
DROP POLICY IF EXISTS "fleet_updates_own_listings" ON public.courier_job_listings;
CREATE POLICY "fleet_updates_own_listings"
  ON public.courier_job_listings
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (public.is_fleet_owner_of(fleet_id))
  WITH CHECK (public.is_fleet_owner_of(fleet_id));

-- No DELETE policy — listings are soft-closed via status (CLOSED / EXPIRED).
-- Platform admin acts via service_role (RLS bypassed by Supabase).

-- ---------------------------------------------------------------------------
-- 11. courier_job_applications — RLS policies
-- ---------------------------------------------------------------------------
-- Courier reads own applications.
DROP POLICY IF EXISTS "courier_reads_own_applications" ON public.courier_job_applications;
CREATE POLICY "courier_reads_own_applications"
  ON public.courier_job_applications
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (courier_user_id = auth.uid());

-- Fleet owner reads applications submitted on their own listings.
DROP POLICY IF EXISTS "fleet_reads_applications_on_own_listings" ON public.courier_job_applications;
CREATE POLICY "fleet_reads_applications_on_own_listings"
  ON public.courier_job_applications
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.courier_job_listings jl
       WHERE jl.id = courier_job_applications.job_listing_id
         AND public.is_fleet_owner_of(jl.fleet_id)
    )
  );

-- Courier inserts own applications, only against OPEN listings.
DROP POLICY IF EXISTS "courier_inserts_own_application" ON public.courier_job_applications;
CREATE POLICY "courier_inserts_own_application"
  ON public.courier_job_applications
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    courier_user_id = auth.uid()
    AND status = 'PENDING'
    AND EXISTS (
      SELECT 1
        FROM public.courier_job_listings jl
       WHERE jl.id = job_listing_id
         AND jl.status = 'OPEN'
    )
  );

-- Courier may WITHDRAW own application any time before HIRED.
DROP POLICY IF EXISTS "courier_withdraws_own_application" ON public.courier_job_applications;
CREATE POLICY "courier_withdraws_own_application"
  ON public.courier_job_applications
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    courier_user_id = auth.uid()
    AND status IN ('PENDING','REVIEWING','INTERVIEWED')
  )
  WITH CHECK (
    courier_user_id = auth.uid()
    AND status = 'WITHDRAWN'
  );

-- Fleet owner transitions applications on own listings
-- (PENDING -> REVIEWING -> INTERVIEWED -> HIRED | REJECTED).
DROP POLICY IF EXISTS "fleet_updates_applications_on_own_listings" ON public.courier_job_applications;
CREATE POLICY "fleet_updates_applications_on_own_listings"
  ON public.courier_job_applications
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.courier_job_listings jl
       WHERE jl.id = courier_job_applications.job_listing_id
         AND public.is_fleet_owner_of(jl.fleet_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.courier_job_listings jl
       WHERE jl.id = courier_job_applications.job_listing_id
         AND public.is_fleet_owner_of(jl.fleet_id)
    )
    AND status IN ('REVIEWING','INTERVIEWED','HIRED','REJECTED')
  );

-- No DELETE policy — applications are immutable history (WITHDRAWN / REJECTED).

-- ---------------------------------------------------------------------------
-- 12. GRANT minimal column-set privileges (after REVOKE in §8)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.courier_job_listings     TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.courier_job_applications TO authenticated;

-- ============================================================================
-- END 20260616_013_courier_job_board.sql
-- ============================================================================
