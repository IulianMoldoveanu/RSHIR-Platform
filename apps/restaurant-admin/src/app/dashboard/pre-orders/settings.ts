// Admin-side mirror of the storefront helper. We duplicate intentionally
// (same shape, different package) instead of reaching across apps — it's 50
// LOC of pure functions and avoids creating a new shared package for a
// single use site.

export type PreOrderSettings = {
  enabled: boolean;
  min_advance_hours: number;
  max_advance_days: number;
  min_subtotal_ron: number;
};

const DEFAULTS: PreOrderSettings = {
  enabled: false,
  min_advance_hours: 24,
  max_advance_days: 14,
  min_subtotal_ron: 0,
};

const MIN_HOURS_LOWER = 1;
const MIN_HOURS_UPPER = 30 * 24;
const MAX_DAYS_LOWER = 1;
const MAX_DAYS_UPPER = 60;

function clampNum(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}

export function readPreOrderSettings(rawTenantSettings: unknown): PreOrderSettings {
  if (!rawTenantSettings || typeof rawTenantSettings !== 'object') return { ...DEFAULTS };
  const root = rawTenantSettings as Record<string, unknown>;
  const node = root.pre_orders;
  if (!node || typeof node !== 'object') return { ...DEFAULTS };
  const n = node as Record<string, unknown>;

  return {
    enabled: n.enabled === true,
    min_advance_hours: clampNum(
      n.min_advance_hours,
      MIN_HOURS_LOWER,
      MIN_HOURS_UPPER,
      DEFAULTS.min_advance_hours,
    ),
    max_advance_days: clampNum(
      n.max_advance_days,
      MAX_DAYS_LOWER,
      MAX_DAYS_UPPER,
      DEFAULTS.max_advance_days,
    ),
    min_subtotal_ron: clampNum(n.min_subtotal_ron, 0, 100_000, DEFAULTS.min_subtotal_ron),
  };
}

/** Bounds used by the OWNER form so the spinners stay in safe ranges. */
export const PRE_ORDER_INPUT_BOUNDS = {
  min_advance_hours: { min: MIN_HOURS_LOWER, max: MIN_HOURS_UPPER },
  max_advance_days: { min: MAX_DAYS_LOWER, max: MAX_DAYS_UPPER },
  min_subtotal_ron: { min: 0, max: 100_000 },
} as const;
