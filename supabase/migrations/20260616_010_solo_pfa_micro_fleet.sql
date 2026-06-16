-- ============================================================================
-- 20260616_010 — Solo PFA micro-fleet (KYF-light)
-- ============================================================================
-- VISION LOCKED 2026-06-16:
--   Each PFA (Persoană Fizică Autorizată) = its own micro-fleet with a single
--   member (himself). KYF-light flow (ANAF CUI + ID + selfie) is sufficient
--   for solo PFAs because there is no employer/employee relationship — the
--   PFA contracts directly with vendors via the open marketplace.
--
--   HIR4You FIREWALL preserved per Dir. UE 2024/2831 (transpunere RO 2dec2026):
--     leg 1 — money flows vendor -> PFA directly (HIR never touches funds)
--     leg 2 — algorithmic control stays at fleet/PFA level (no robo-firing)
--     leg 3 — HIR provides infra/data layer only; PFA = independent contractor
--   Solo PFA = own fleet = own legs intact => zero employer-presumption risk.
--
-- ANTI-REGRESSION (CLAUDE.md §5):
--   - idempotent: ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS / ADD
--   - REVOKE-before-GRANT: not applicable (no new tables, no new GRANTs)
--   - no SECDEF fn introduced here; existing helpers (is_fleet_owner_of,
--     fn_is_fleet_operational) already work transparently for is_pfa_solo=true
--   - RLS: no new policies — existing marketplace_listings / marketplace_offers
--     RLS already scope by fleet_id; solo PFAs inherit them via courier_fleets
--
-- FEATURE FLAG (gates UI/onboarding, NOT schema):
--   HIR_FEATURE_SOLO_PFA_ENABLED=false (default OFF post-migration)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. courier_fleets.is_pfa_solo — marks fleet as single-member PFA micro-fleet
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.courier_fleets
  ADD COLUMN IF NOT EXISTS is_pfa_solo BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.courier_fleets.is_pfa_solo IS $cmt$TRUE = solo PFA micro-fleet (single member = owner). KYF-light flow (ANAF CUI + ID + selfie). Vision LOCKED 2026-06-16: each PFA owns its own fleet to preserve HIR4You firewall (Dir UE 2024/2831).$cmt$;

-- ---------------------------------------------------------------------------
-- 2. courier_fleets.pfa_cui — ANAF unique identifier (nullable, validated
--    server-side against ANAF public registry; format: 8-10 digits, no RO prefix)
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.courier_fleets
  ADD COLUMN IF NOT EXISTS pfa_cui TEXT;

COMMENT ON COLUMN public.courier_fleets.pfa_cui IS $cmt$ANAF CUI (Cod Unic de Înregistrare) for solo PFA. Nullable until KYF-light verification. Validated server-side via ANAF public API (anaf.ro/info-cui). Format: 8-10 digits, no RO prefix.$cmt$;

-- ---------------------------------------------------------------------------
-- 3. courier_fleets.pfa_owner_user_id — auth user that IS the PFA holder
--    (denormalized from courier_fleets.owner_user_id for clarity when
--    is_pfa_solo=TRUE; for non-solo fleets this column is NULL).
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.courier_fleets
  ADD COLUMN IF NOT EXISTS pfa_owner_user_id UUID;

COMMENT ON COLUMN public.courier_fleets.pfa_owner_user_id IS $cmt$auth.users.id of the PFA holder when is_pfa_solo=TRUE. For non-solo (multi-member) fleets this is NULL. Use owner_user_id for generic fleet ownership checks; pfa_owner_user_id disambiguates micro-fleets where owner == sole courier.$cmt$;

-- ---------------------------------------------------------------------------
-- 4. fleet_kyf.kyf_status — extend CHECK to accept VERIFIED_PFA_LIGHT
--    Pattern: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (idempotent)
--    Postgres auto-names CHECK constraints; we drop by canonical name first,
--    then by introspection fallback if needed.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  cname text;
BEGIN
  -- Drop any existing CHECK constraint on fleet_kyf.kyf_status (by introspection)
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relname = 'fleet_kyf'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%kyf_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.fleet_kyf DROP CONSTRAINT IF EXISTS %I', cname);
  END LOOP;

  -- Re-add with extended value set (idempotent because we just dropped)
  EXECUTE $constraint$
    ALTER TABLE public.fleet_kyf
      ADD CONSTRAINT fleet_kyf_kyf_status_check
      CHECK (kyf_status IN ('PENDING','VERIFIED','REJECTED','VERIFIED_PFA_LIGHT'))
  $constraint$;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'fleet_kyf does not exist — skipping kyf_status CHECK update';
END;
$$;

COMMENT ON COLUMN public.fleet_kyf.kyf_status IS $cmt$KYF lifecycle: PENDING (submitted), VERIFIED (full multi-member fleet), REJECTED (manual review failed), VERIFIED_PFA_LIGHT (solo PFA KYF-light: ANAF CUI + ID + selfie verified — added 2026-06-16).$cmt$;

-- ---------------------------------------------------------------------------
-- 5. Partial index for active solo PFA fleets (hot path: marketplace match,
--    PFA-only filters in dispatcher/admin UI)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_courier_fleets_pfa_solo_active
  ON public.courier_fleets (is_pfa_solo, is_active)
  WHERE is_pfa_solo = TRUE;

COMMENT ON INDEX public.ix_courier_fleets_pfa_solo_active IS $cmt$Hot path for solo PFA filters (marketplace match scoring, admin dashboards). Partial index keeps non-PFA fleets out of the index — small footprint.$cmt$;

-- ---------------------------------------------------------------------------
-- 6. Table-level comment summarising the vision for future maintainers
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.courier_fleets IS $cmt$Courier fleets registry. Vision LOCKED 2026-06-16: each PFA = its own micro-fleet (is_pfa_solo=TRUE) with a single member (himself). KYF-light flow (ANAF CUI + ID + selfie) is sufficient for solo PFAs. HIR4You firewall (Dir UE 2024/2831) preserved on all 3 legs: money vendor->PFA direct, algorithmic control at PFA level, HIR = infra/data only. Feature flag HIR_FEATURE_SOLO_PFA_ENABLED gates onboarding UI; schema is forward-safe.$cmt$;

-- ---------------------------------------------------------------------------
-- 7. Cod fiscal RO 10y retention — mark courier_fleets as financial record
--    (PFA fleets carry fiscal identity = CUI; purge crons MUST exclude these)
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.courier_fleets
  ADD COLUMN IF NOT EXISTS is_financial_record BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.courier_fleets.is_financial_record IS $cmt$Cod fiscal RO 10y retention. Purge crons MUST exclude WHERE is_financial_record = TRUE. Solo PFA fleets carry CUI (fiscal identity) — never purge.$cmt$;

-- ============================================================================
-- Feature flag note (NOT applied here, schema-only migration):
--   Activation gated in UI/onboarding by env HIR_FEATURE_SOLO_PFA_ENABLED.
--   When OFF: signup forms / fleet-create RPCs reject is_pfa_solo=TRUE.
--   When ON:  KYF-light wizard becomes available; existing KYF stays default.
-- ============================================================================
