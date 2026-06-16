-- ============================================================================
-- 20260616_014 — Non-EU permit verify (HIR PASIV M0-M24)
-- ============================================================================
-- VISION LOCKED 2026-06-16 — Open Marketplace Extensions, Stream 7
--   (per board verdict §11.5 PASIV M0-M24):
--
--   HIR PASIV M0-M24 verifies an EXISTING permit issued by IGI (Inspectoratul
--   General pentru Imigrări) ONLY. HIR DOES NOT intermediate acquisition of a
--   permit on behalf of the courier and DOES NOT operate as a recruitment
--   agency for third-country nationals until the 2028 partnership with AIRO /
--   GlobalWorker. Until that date, onboarding of a non-EU resident MUST be
--   refused when permit_status is NOT IN (VERIFIED), and the verification is
--   a passive document review by the platform / fleet operator.
--
--   Layer 1 firewall preserved per HIR4You strategy + Dir UE 2024/2831:
--     - HIR never employs the courier (the fleet does).
--     - HIR hosts the permit document + verification status only (data layer).
--     - Fleet is responsible for the employer-side legal obligations once the
--       permit is VERIFIED + still valid (permit_munca_valid_until in future).
--
-- ANTI-REGRESSION (CLAUDE.md §5):
--   - Idempotent: ALTER TABLE … ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT
--     EXISTS, DROP POLICY IF EXISTS + CREATE POLICY, CREATE OR REPLACE
--     FUNCTION, DROP TRIGGER IF EXISTS + CREATE TRIGGER.
--   - REVOKE-before-GRANT on every new table (least privilege first).
--   - SECDEF helpers SET search_path = pg_catalog, public, extensions
--     (matches 20260616_008 hardening standard).
--   - Reuses existing helpers: public.is_fleet_owner_of(uuid) from
--     20260616_009; public.current_courier_fleet_id() from 20260628_005.
--   - Admin acts via service_role (RLS bypassed by Supabase). No new admin
--     helper is created at the DB layer (consistent with Stream 5).
--
-- FEATURE FLAG (gates UI/edge fns, NOT schema):
--   HIR_FEATURE_NON_EU_PERMIT_VERIFY_ENABLED=false (default OFF post-migration)
--
-- CRON (schema only here — wiring deferred):
--   public.fn_expire_courier_permits() flips VERIFIED rows to EXPIRED once
--   permit_munca_valid_until < CURRENT_DATE. Daily cron edge fn lands in a
--   follow-up migration; NOT exposed to authenticated callers.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend public.courier_profiles with non-EU permit fields (idempotent)
-- ---------------------------------------------------------------------------
ALTER TABLE public.courier_profiles
  ADD COLUMN IF NOT EXISTS is_non_eu_resident       boolean NOT NULL DEFAULT false;

ALTER TABLE public.courier_profiles
  ADD COLUMN IF NOT EXISTS permit_country_iso       text;

ALTER TABLE public.courier_profiles
  ADD COLUMN IF NOT EXISTS permit_munca_valid_until date;

ALTER TABLE public.courier_profiles
  ADD COLUMN IF NOT EXISTS permit_doc_url           text;

ALTER TABLE public.courier_profiles
  ADD COLUMN IF NOT EXISTS permit_verified_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.courier_profiles
  ADD COLUMN IF NOT EXISTS permit_verified_at       timestamptz;

ALTER TABLE public.courier_profiles
  ADD COLUMN IF NOT EXISTS permit_status            text NOT NULL DEFAULT 'PENDING';

-- ISO 3166-1 alpha-3 format guard (NPL, IND, BGD, PHL, UKR, MDA, etc).
-- Idempotent: drop + recreate the CHECK; UPPER-case enforced.
ALTER TABLE public.courier_profiles
  DROP CONSTRAINT IF EXISTS courier_profiles_permit_country_iso_chk;

ALTER TABLE public.courier_profiles
  ADD CONSTRAINT courier_profiles_permit_country_iso_chk
  CHECK (
    permit_country_iso IS NULL
    OR permit_country_iso ~ '^[A-Z]{3}$'
  );

-- permit_status enum guard. Idempotent: drop + recreate.
ALTER TABLE public.courier_profiles
  DROP CONSTRAINT IF EXISTS courier_profiles_permit_status_chk;

ALTER TABLE public.courier_profiles
  ADD CONSTRAINT courier_profiles_permit_status_chk
  CHECK (permit_status IN ('PENDING','VERIFIED','REJECTED','EXPIRED'));

-- Cross-field invariant: if the courier is flagged non-EU then a country
-- ISO and a permit_munca_valid_until date are mandatory once the row leaves
-- PENDING. NULL allowed while PENDING so the courier can complete onboarding
-- in stages. Idempotent.
ALTER TABLE public.courier_profiles
  DROP CONSTRAINT IF EXISTS courier_profiles_non_eu_required_fields_chk;

ALTER TABLE public.courier_profiles
  ADD CONSTRAINT courier_profiles_non_eu_required_fields_chk
  CHECK (
    is_non_eu_resident = false
    OR permit_status = 'PENDING'
    OR (
      permit_country_iso       IS NOT NULL
      AND permit_munca_valid_until IS NOT NULL
      AND permit_doc_url           IS NOT NULL
    )
  );

COMMENT ON COLUMN public.courier_profiles.is_non_eu_resident IS
  'HIR PASIV M0-M24 flag. true = courier is a third-country national requiring an IGI-issued permit to work legally in RO. Onboarding MUST be refused when true AND permit_status NOT IN (VERIFIED). Per board verdict §11.5 LOCKED.';

COMMENT ON COLUMN public.courier_profiles.permit_country_iso IS
  'ISO 3166-1 alpha-3 country code of the courier''s citizenship (NPL, IND, BGD, PHL, UKR, etc). NULL while permit_status=PENDING.';

COMMENT ON COLUMN public.courier_profiles.permit_munca_valid_until IS
  'Expiry date (date, not timestamptz — IGI issues calendar dates) of the work-permit (permis de muncă / permis unic). EXPIRED status is auto-set once this falls before CURRENT_DATE via fn_expire_courier_permits cron.';

COMMENT ON COLUMN public.courier_profiles.permit_doc_url IS
  'Supabase Storage path to the scanned permit document. Private bucket; only the courier (self) + service_role can read. Fleet sees only the validity badge, never the raw doc.';

COMMENT ON COLUMN public.courier_profiles.permit_verified_by IS
  'auth.users.id of the platform reviewer (service_role-driven) that flipped permit_status to VERIFIED or REJECTED. NULL while PENDING.';

COMMENT ON COLUMN public.courier_profiles.permit_verified_at IS
  'Timestamp of the verification decision (VERIFIED or REJECTED). NULL while PENDING.';

COMMENT ON COLUMN public.courier_profiles.permit_status IS
  'PENDING (default — awaiting review) -> VERIFIED | REJECTED. Cron flips VERIFIED -> EXPIRED once permit_munca_valid_until < CURRENT_DATE. Until 2028 AIRO/GlobalWorker partnership, HIR only verifies an existing IGI permit (passive); it does NOT acquire one on behalf of the courier. Per board §11.5 PASIV M0-M24.';

-- ---------------------------------------------------------------------------
-- 2. Index: fast lookup of permits about to expire (cron sweep)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_courier_profiles_permit_expiry
  ON public.courier_profiles (permit_munca_valid_until)
  WHERE is_non_eu_resident = true
    AND permit_status = 'VERIFIED';

-- Index: admin queue of pending verifications.
CREATE INDEX IF NOT EXISTS ix_courier_profiles_permit_pending
  ON public.courier_profiles (permit_status)
  WHERE is_non_eu_resident = true
    AND permit_status = 'PENDING';

-- ---------------------------------------------------------------------------
-- 3. Audit history table — every permit_status change is recorded immutably.
--    courier_profiles has no tenant_id, so we cannot reuse public.audit_log
--    (tenant_id NOT NULL). A dedicated history table keeps the audit trail
--    queryable per courier_user_id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courier_permit_audit_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  old_status        text,
  new_status        text NOT NULL,
  permit_country_iso       text,
  permit_munca_valid_until date,
  reason            text,
  metadata          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.courier_permit_audit_log IS
  'Immutable history of permit_status transitions on public.courier_profiles. One row per change. actor_user_id is the reviewer (service_role context => auth.uid() may be NULL; metadata carries trace info). Tenant-agnostic because couriers belong to fleets, not tenants.';

CREATE INDEX IF NOT EXISTS ix_courier_permit_audit_log_courier_created
  ON public.courier_permit_audit_log (courier_user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. SECDEF helper: fn_check_permit_valid(p_courier_user_id)
--    Returns true ONLY when the courier is non-EU AND permit_status=VERIFIED
--    AND permit_munca_valid_until >= CURRENT_DATE. EU-resident couriers
--    (is_non_eu_resident=false) also return true (no permit gating applies).
--    Used by onboarding gate + dispatcher pre-flight + UI badge.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_check_permit_valid(p_courier_user_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
AS $$
  SELECT COALESCE(
    (
      SELECT
        CASE
          WHEN cp.is_non_eu_resident = false THEN true
          WHEN cp.permit_status = 'VERIFIED'
               AND cp.permit_munca_valid_until IS NOT NULL
               AND cp.permit_munca_valid_until >= CURRENT_DATE
            THEN true
          ELSE false
        END
        FROM public.courier_profiles cp
       WHERE cp.user_id = p_courier_user_id
       LIMIT 1
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.fn_check_permit_valid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_check_permit_valid(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_check_permit_valid(uuid) IS
  'HIR PASIV M0-M24 gate. Returns true if the courier (a) is not flagged non-EU OR (b) is non-EU with permit_status=VERIFIED AND permit_munca_valid_until >= CURRENT_DATE. Onboarding + dispatch MUST refuse the courier when this returns false. SECDEF with hardened search_path per 20260616_008.';

-- ---------------------------------------------------------------------------
-- 5. Cron sweep: auto-flip VERIFIED -> EXPIRED once permit_munca_valid_until
--    is past CURRENT_DATE. Schema-only; cron edge fn wiring lands in a
--    follow-up migration (NOT exposed to authenticated callers).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_expire_courier_permits()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.courier_profiles cp
       SET permit_status = 'EXPIRED'
     WHERE cp.is_non_eu_resident = true
       AND cp.permit_status = 'VERIFIED'
       AND cp.permit_munca_valid_until IS NOT NULL
       AND cp.permit_munca_valid_until < CURRENT_DATE
    RETURNING cp.user_id
  )
  SELECT COUNT(*)::integer INTO v_count FROM expired;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_expire_courier_permits() FROM PUBLIC;
-- service_role is the only caller (cron edge fn). No GRANT to authenticated.

COMMENT ON FUNCTION public.fn_expire_courier_permits() IS
  'Daily cron sweep that flips courier_profiles.permit_status VERIFIED -> EXPIRED when permit_munca_valid_until < CURRENT_DATE. Returns the row count expired. Schema-only here; cron wiring lands in a follow-up edge fn / pg_cron job. SECDEF with hardened search_path per 20260616_008.';

-- ---------------------------------------------------------------------------
-- 6. Audit trigger: log every permit_status change to courier_permit_audit_log
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_log_courier_permit_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  -- Only log when permit_status actually transitions (or on first insert with
  -- a non-default state — service_role bulk seed protection).
  IF TG_OP = 'INSERT' THEN
    IF NEW.permit_status IS DISTINCT FROM 'PENDING' THEN
      INSERT INTO public.courier_permit_audit_log (
        courier_user_id, actor_user_id, old_status, new_status,
        permit_country_iso, permit_munca_valid_until, reason, metadata
      ) VALUES (
        NEW.user_id, auth.uid(), NULL, NEW.permit_status,
        NEW.permit_country_iso, NEW.permit_munca_valid_until, NULL,
        jsonb_build_object(
          'is_non_eu_resident', NEW.is_non_eu_resident,
          'permit_doc_url_present', (NEW.permit_doc_url IS NOT NULL),
          'trigger_op', 'INSERT'
        )
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.permit_status IS DISTINCT FROM NEW.permit_status
  THEN
    INSERT INTO public.courier_permit_audit_log (
      courier_user_id, actor_user_id, old_status, new_status,
      permit_country_iso, permit_munca_valid_until, reason, metadata
    ) VALUES (
      NEW.user_id, auth.uid(), OLD.permit_status, NEW.permit_status,
      NEW.permit_country_iso, NEW.permit_munca_valid_until, NULL,
      jsonb_build_object(
        'is_non_eu_resident', NEW.is_non_eu_resident,
        'permit_doc_url_present', (NEW.permit_doc_url IS NOT NULL),
        'permit_verified_by', NEW.permit_verified_by,
        'permit_verified_at', NEW.permit_verified_at,
        'trigger_op', 'UPDATE'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_log_courier_permit_change() FROM PUBLIC;

COMMENT ON FUNCTION public.fn_log_courier_permit_change() IS
  'AFTER INSERT/UPDATE trigger fn for public.courier_profiles permit_status changes. Writes one row to public.courier_permit_audit_log per transition. SECDEF with hardened search_path per 20260616_008.';

DROP TRIGGER IF EXISTS trg_log_courier_permit_change ON public.courier_profiles;
CREATE TRIGGER trg_log_courier_permit_change
  AFTER INSERT OR UPDATE OF permit_status
  ON public.courier_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_log_courier_permit_change();

-- ---------------------------------------------------------------------------
-- 7. REVOKE base privileges on the new audit table (least privilege first)
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.courier_permit_audit_log FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. RLS enable on the new audit table
-- ---------------------------------------------------------------------------
ALTER TABLE public.courier_permit_audit_log ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 9. courier_permit_audit_log — RLS policies
--    - Courier reads own audit trail.
--    - Fleet owner reads the audit trail of couriers assigned to their fleet
--      (joined via courier_profiles.fleet_id) BUT only the validity badge
--      view (no raw doc; permit_doc_url is on courier_profiles, not here).
--    - Platform admin acts via service_role (RLS bypassed by Supabase).
--    - No INSERT/UPDATE/DELETE policies — only the SECDEF trigger writes.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "courier_reads_own_permit_audit"
  ON public.courier_permit_audit_log;
CREATE POLICY "courier_reads_own_permit_audit"
  ON public.courier_permit_audit_log
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (courier_user_id = auth.uid());

DROP POLICY IF EXISTS "fleet_reads_courier_permit_audit"
  ON public.courier_permit_audit_log;
CREATE POLICY "fleet_reads_courier_permit_audit"
  ON public.courier_permit_audit_log
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.courier_profiles cp
       WHERE cp.user_id = courier_permit_audit_log.courier_user_id
         AND cp.fleet_id IS NOT NULL
         AND public.is_fleet_owner_of(cp.fleet_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 10. courier_profiles — extend RLS so non-EU permit raw fields are
--     read-restricted: the fleet owner already sees the row via the existing
--     courier_profiles_self_read policy (fleet_id match), which exposes the
--     full row. To enforce "fleet sees only valid/expired badge, NOT raw
--     docs", the application layer (apps/courier-admin) MUST select only
--     permit_status + permit_munca_valid_until when rendering the fleet view,
--     and never permit_doc_url / permit_country_iso. The DB layer cannot
--     forbid column reads without dropping to column-level GRANTs, which
--     would break the existing fleet UI. This trade-off is documented here
--     so the next developer does NOT add SELECT permit_doc_url to the fleet
--     UI without an explicit policy review.
--
--     SECURITY GUARANTEE AT DB LAYER:
--       - courier (self) reads everything on own row (existing policy).
--       - fleet owner reads the row (existing policy) BUT MUST omit
--         permit_doc_url + permit_country_iso in app-layer SELECTs.
--       - service_role bypasses RLS (platform admin path).
--
--     A future tightening pass should split raw permit fields into a separate
--     table (e.g. courier_permit_documents) with row-level access restricted
--     to (self OR service_role) only — out of scope for this migration.
-- ---------------------------------------------------------------------------

-- No GRANT to authenticated on courier_permit_audit_log; reads pass through
-- the RLS policies above which already cover the legitimate read paths.
GRANT SELECT ON public.courier_permit_audit_log TO authenticated;

-- ============================================================================
-- END 20260616_014_non_eu_permit_verify.sql
-- ============================================================================
