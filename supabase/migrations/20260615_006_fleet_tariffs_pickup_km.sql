-- ============================================================================
-- Fleet tariffs (pickup + per km) — both courier-side AND vendor-side
-- Iulian directive 2026-06-15: "fleet manager seteaza 2 tarife din panou:
-- catre curieri + catre vendori. tarif fix pe pickup + plata per km."
--
-- ARCHITECTURE
--   fleet_courier_tariffs (extended) — what the fleet pays its couriers
--     pickup_fee_cents  fixed amount per delivery (RON cents)
--     per_km_cents      variable rate per km (RON cents/km)
--     cod_bonus_cents   optional bonus when the order was COD
--     [legacy] payout_cents kept for backward compat with flat-rate fleets
--
--   fleet_vendor_tariffs (new) — what the fleet charges vendors for a delivery
--     (used when the fleet has its own commercial contract with a restaurant
--     outside HIR's per-zone scheme). Same shape.
--
-- AUTO-SYNC GUARANTEE
--   Both tables are the single source of truth read by:
--     - Courier app /fleet/earnings + /fleet/payouts  (existing)
--     - Admin app /fleet/tariffs                       (new)
--     - Payout cron fn_generate_courier_payout_periods (updates separately)
--   When the fleet manager saves a new tariff via fn_set_fleet_pickup_km_tariff,
--   ALL couriers attached to the fleet see the new rate on next earnings
--   query (no caching layer in between).
--
-- BACKWARD COMPAT
--   Existing rows with NULL pickup_fee_cents + per_km_cents fall back to the
--   flat payout_cents value (legacy semantics). The payout cron should prefer
--   the new fields when both are non-NULL; this migration does NOT alter the
--   cron logic (cron update in a follow-up — separation of concerns).
-- ============================================================================

BEGIN;

-- 1. Extend fleet_courier_tariffs additively
ALTER TABLE public.fleet_courier_tariffs
  ADD COLUMN IF NOT EXISTS pickup_fee_cents int,
  ADD COLUMN IF NOT EXISTS per_km_cents int;

COMMENT ON COLUMN public.fleet_courier_tariffs.pickup_fee_cents IS
  'Fixed per-pickup amount in RON cents. Pair with per_km_cents for distance-based pricing. NULL = legacy flat (use payout_cents).';
COMMENT ON COLUMN public.fleet_courier_tariffs.per_km_cents IS
  'Variable per-km rate in RON cents/km. Combined with pickup_fee_cents to compute payout = pickup_fee + per_km * distance_km.';

-- 2. Create fleet_vendor_tariffs (mirror structure)
CREATE TABLE IF NOT EXISTS public.fleet_vendor_tariffs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id         uuid NOT NULL REFERENCES public.courier_fleets(id) ON DELETE CASCADE,
  zone_id          uuid REFERENCES public.pricing_zones(id) ON DELETE SET NULL,
  pickup_fee_cents int  NOT NULL DEFAULT 0 CHECK (pickup_fee_cents >= 0 AND pickup_fee_cents <= 100000),
  per_km_cents     int  NOT NULL DEFAULT 0 CHECK (per_km_cents >= 0 AND per_km_cents <= 100000),
  cod_bonus_cents  int  NOT NULL DEFAULT 0 CHECK (cod_bonus_cents >= 0 AND cod_bonus_cents <= 100000),
  valid_from       timestamptz NOT NULL DEFAULT now(),
  valid_until      timestamptz,
  reason           text,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fleet_vendor_tariffs IS
  'What a fleet charges vendors per delivery (pickup + per_km + COD bonus). Independent of HIR pricing_zones (which is the platform-side fee). Used when a fleet has direct commercial deals with restaurants.';

CREATE INDEX IF NOT EXISTS idx_fleet_vendor_tariffs_active
  ON public.fleet_vendor_tariffs (fleet_id, valid_from DESC)
  WHERE valid_until IS NULL;
CREATE INDEX IF NOT EXISTS idx_fleet_vendor_tariffs_zone
  ON public.fleet_vendor_tariffs (fleet_id, zone_id)
  WHERE valid_until IS NULL;

ALTER TABLE public.fleet_vendor_tariffs ENABLE ROW LEVEL SECURITY;

-- Owner of the fleet reads their own tariffs (history + active).
DROP POLICY IF EXISTS fleet_vendor_tariffs_owner_read ON public.fleet_vendor_tariffs;
CREATE POLICY fleet_vendor_tariffs_owner_read
  ON public.fleet_vendor_tariffs
  FOR SELECT
  TO authenticated
  USING (
    fleet_id IN (
      SELECT id FROM public.courier_fleets WHERE owner_user_id = auth.uid()
    )
  );

GRANT SELECT ON public.fleet_vendor_tariffs TO authenticated;

-- 3. Atomic upsert RPC: expire prior active tariff + insert new one
CREATE OR REPLACE FUNCTION public.fn_set_fleet_pickup_km_tariff(
  p_fleet_id         uuid,
  p_table_name       text,
  p_pickup_fee_cents int,
  p_per_km_cents     int,
  p_cod_bonus_cents  int,
  p_created_by       uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_new_id uuid;
BEGIN
  IF p_table_name NOT IN ('courier', 'vendor') THEN
    RAISE EXCEPTION 'p_table_name must be courier or vendor, got %', p_table_name;
  END IF;
  IF p_pickup_fee_cents < 0 OR p_pickup_fee_cents > 100000 THEN
    RAISE EXCEPTION 'pickup_fee_cents out of range';
  END IF;
  IF p_per_km_cents < 0 OR p_per_km_cents > 100000 THEN
    RAISE EXCEPTION 'per_km_cents out of range';
  END IF;
  IF p_cod_bonus_cents < 0 OR p_cod_bonus_cents > 100000 THEN
    RAISE EXCEPTION 'cod_bonus_cents out of range';
  END IF;

  IF p_table_name = 'courier' THEN
    UPDATE public.fleet_courier_tariffs
       SET valid_until = now()
     WHERE fleet_id = p_fleet_id
       AND valid_until IS NULL
       AND zone_id IS NULL;

    INSERT INTO public.fleet_courier_tariffs(
      fleet_id, zone_id,
      pickup_fee_cents, per_km_cents,
      payout_cents,  -- legacy mirror: flat = pickup_fee (for code paths that read flat only)
      cod_bonus_cents,
      created_by
    ) VALUES (
      p_fleet_id, NULL,
      p_pickup_fee_cents, p_per_km_cents,
      p_pickup_fee_cents,
      p_cod_bonus_cents,
      p_created_by
    )
    RETURNING id INTO v_new_id;
  ELSE
    UPDATE public.fleet_vendor_tariffs
       SET valid_until = now()
     WHERE fleet_id = p_fleet_id
       AND valid_until IS NULL
       AND zone_id IS NULL;

    INSERT INTO public.fleet_vendor_tariffs(
      fleet_id,
      pickup_fee_cents, per_km_cents, cod_bonus_cents,
      created_by
    ) VALUES (
      p_fleet_id,
      p_pickup_fee_cents, p_per_km_cents, p_cod_bonus_cents,
      p_created_by
    )
    RETURNING id INTO v_new_id;
  END IF;

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_set_fleet_pickup_km_tariff(uuid, text, int, int, int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_fleet_pickup_km_tariff(uuid, text, int, int, int, uuid) TO service_role;

COMMENT ON FUNCTION public.fn_set_fleet_pickup_km_tariff(uuid, text, int, int, int, uuid) IS
  'Atomic upsert of a fleet pickup+km tariff. Expires the prior active fleet-wide (zone_id NULL) row in the chosen table and inserts the new one. p_table_name: courier (what fleet pays courier) or vendor (what fleet charges vendor). Returns the new tariff row id. Service_role only (server actions call via createAdminClient).';

COMMIT;
