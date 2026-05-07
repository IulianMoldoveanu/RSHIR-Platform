// Pre-order settings — read/validate against tenants.settings.pre_orders.
// Mirrors the smartbill helper pattern. Default OFF; OWNER opts in.

export type PreOrderSettings = {
  /** Master toggle. Storefront page returns 404 when false. */
  enabled: boolean;
  /** Earliest acceptable lead time. UI clamps the picker to now() + this. */
  min_advance_hours: number;
  /** Latest acceptable booking horizon. UI clamps the picker to now() + this. */
  max_advance_days: number;
  /** Optional cart-subtotal floor (RON). 0 = disabled. */
  min_subtotal_ron: number;
};

const DEFAULTS: PreOrderSettings = {
  enabled: false,
  min_advance_hours: 24,
  max_advance_days: 14,
  min_subtotal_ron: 0,
};

const MIN_HOURS_LOWER = 1;
const MIN_HOURS_UPPER = 30 * 24; // 30 days
const MAX_DAYS_LOWER = 1;
const MAX_DAYS_UPPER = 60;

function clampNum(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}

/**
 * Read pre-order settings from tenants.settings (jsonb). Tolerant of missing
 * keys, partial objects, type drift. Always returns a fully-populated
 * PreOrderSettings — UI code never branches on undefined.
 */
export function readPreOrderSettings(
  rawTenantSettings: unknown,
): PreOrderSettings {
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

export type PreOrderScheduleCheck =
  | { ok: true }
  | { ok: false; reason: 'too_soon' | 'too_far' | 'invalid' };

/**
 * Server-side validation of a customer-supplied scheduled_for timestamp.
 * The UI clamps the picker, but a determined client can POST any value, so
 * the API recomputes the bounds against the same settings before insert.
 */
export function checkScheduledForBounds(
  scheduledForIso: string,
  settings: PreOrderSettings,
  now: Date = new Date(),
): PreOrderScheduleCheck {
  const t = new Date(scheduledForIso);
  if (Number.isNaN(t.getTime())) return { ok: false, reason: 'invalid' };
  const minMs = now.getTime() + settings.min_advance_hours * 3_600_000;
  const maxMs = now.getTime() + settings.max_advance_days * 86_400_000;
  if (t.getTime() < minMs) return { ok: false, reason: 'too_soon' };
  if (t.getTime() > maxMs) return { ok: false, reason: 'too_far' };
  return { ok: true };
}
