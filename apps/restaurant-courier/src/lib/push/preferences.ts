'use client';

/**
 * Courier notification preference categories.
 *
 * Persisted in localStorage under PREFS_KEY. Defaults applied when the
 * key is absent so new installs always have the correct default state
 * without requiring a save action.
 *
 * Server-side enforcement (Edge Function + DB column) is OPERATOR-GATED.
 * These prefs are currently client-only: the push-bootstrap component
 * honours `new_orders` before calling for OS permission. The
 * `courier-push-dispatch` Edge Function still fires for all couriers
 * regardless of category until a `preferences jsonb` column is added
 * to `courier_push_subscriptions` and the function is redeployed.
 */

export type NotificationCategory =
  | 'new_orders'
  | 'dispatcher_messages'
  | 'urgencies'
  | 'marketing';

export type NotificationPreferences = Record<NotificationCategory, boolean>;

const PREFS_KEY = 'hir:notif-prefs-v1';

const DEFAULTS: NotificationPreferences = {
  new_orders: true,
  dispatcher_messages: true,
  urgencies: true,
  marketing: false,
};

export function loadPreferences(): NotificationPreferences {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    // Merge with DEFAULTS so new categories added later get their default
    // value on existing installs without a migration step.
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePreferences(prefs: NotificationPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage blocked (private mode, storage full). Silently ignore.
  }
}

/** Returns true when the given category is enabled per stored preferences. */
export function isCategoryEnabled(category: NotificationCategory): boolean {
  return loadPreferences()[category];
}
