-- ============================================================================
-- Migration: 30-day data retention for fleets + couriers
-- Iulian directive 2026-06-15: "daca se sterg, datele lor vor fi pastrate
-- inca 30 de zile"
--
-- Pattern: soft-delete via `deleted_at` timestamp. UI/operations treat
-- deleted_at IS NOT NULL as "gone". Daily cron purges rows where deleted_at
-- < now() - 30 days (hard delete; including Storage objects via the
-- fleet_kyf_purge edge function — out of scope of this DDL).
--
-- Tables affected:
--   - courier_fleets    (the fleet itself)
--   - fleet_kyf         (KYF documents — purge takes Storage objects too)
--   - courier_profiles  (individual courier)
--   - courier_kyc       (courier KYC docs — purge with profile)
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ============================================================================

BEGIN;

ALTER TABLE public.courier_fleets
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.fleet_kyf
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.courier_profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.courier_kyc
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_courier_fleets_deleted_at
  ON public.courier_fleets (deleted_at)
  WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fleet_kyf_deleted_at
  ON public.fleet_kyf (deleted_at)
  WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_courier_profiles_deleted_at
  ON public.courier_profiles (deleted_at)
  WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_courier_kyc_deleted_at
  ON public.courier_kyc (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Purge function — runs daily via cron. Hard-deletes rows older than 30 days.
-- Returns count purged for observability.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_purge_30day_retention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cutoff timestamptz := now() - interval '30 days';
  c_fleets int := 0;
  c_kyf int := 0;
  c_profiles int := 0;
  c_kyc int := 0;
BEGIN
  DELETE FROM public.courier_kyc WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  GET DIAGNOSTICS c_kyc = ROW_COUNT;
  DELETE FROM public.courier_profiles WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  GET DIAGNOSTICS c_profiles = ROW_COUNT;
  DELETE FROM public.fleet_kyf WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  GET DIAGNOSTICS c_kyf = ROW_COUNT;
  DELETE FROM public.courier_fleets WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  GET DIAGNOSTICS c_fleets = ROW_COUNT;

  RETURN jsonb_build_object(
    'cutoff', cutoff,
    'purged_courier_kyc', c_kyc,
    'purged_courier_profiles', c_profiles,
    'purged_fleet_kyf', c_kyf,
    'purged_courier_fleets', c_fleets,
    'run_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_purge_30day_retention() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_purge_30day_retention() TO service_role;

COMMENT ON FUNCTION public.fn_purge_30day_retention() IS
  '30-day retention purge. Called daily by edge function fleet-retention-purge. Storage objects (fleet-kyf, courier-kyc) are deleted by the edge function after this returns the counts. Service-role only.';

COMMIT;

-- ============================================================================
-- POST-DEPLOY:
--   1. Schedule daily cron (Supabase cron_jobs or pg_cron):
--      SELECT cron.schedule('purge-30day', '15 3 * * *', $$ SELECT public.fn_purge_30day_retention() $$);
--   2. Build edge function `fleet-retention-purge` that:
--      a) calls fn_purge_30day_retention() to identify what was purged
--      b) deletes corresponding objects from fleet-kyf + courier-kyc buckets
--   3. Update fleet/courier UIs to set deleted_at on delete (NOT hard-delete).
-- ============================================================================
