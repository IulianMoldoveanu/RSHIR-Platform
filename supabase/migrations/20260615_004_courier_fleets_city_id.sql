-- ============================================================================
-- courier_fleets.primary_city_id — add city association to fleets
-- Iulian directive 2026-06-15. Audit 19-agent found:
--   - courier_fleets has NO city column today (schema gap)
--   - fleet-allocation/algorithm.ts:153 matches fleet city to tenant city, but
--     since fleet has no city it pairs against NULL and rejects everything.
--
-- Additive: nullable FK. Existing rows stay city-less (will use NULL pairing
-- which the algorithm treats as wildcard).
-- ============================================================================

BEGIN;

ALTER TABLE public.courier_fleets
  ADD COLUMN IF NOT EXISTS primary_city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_courier_fleets_primary_city
  ON public.courier_fleets (primary_city_id)
  WHERE primary_city_id IS NOT NULL;

COMMENT ON COLUMN public.courier_fleets.primary_city_id IS
  'Primary city the fleet operates in. NULL = wildcard (platform-wide). Used by fleet-allocation to pair fleets with same-city tenants. Set at signup time via /fleet-signup picker.';

COMMIT;
