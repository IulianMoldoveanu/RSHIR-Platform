'use client';

import { useEffect, useRef, useState } from 'react';

const LOCATION_DISMISS_KEY = 'hir.courier.locationPromptDismissedAt';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Battery-adaptive multipliers. Courier shifts are long (4–12h on
// average); pushing one GPS fix every 30s on a low battery is the
// difference between a rider finishing their shift and bricking mid-
// delivery. Multipliers are intentionally conservative so they barely
// affect dispatcher visibility under normal conditions, but kick in
// hard when the device is genuinely low.
//
// Thresholds match common phone "low power mode" cutoffs:
//   <30% → x2 (60s default base) — equivalent to iOS low-power mode
//   <15% → x4 (120s) — about to die; saving juice trumps GPS fidelity
//   charging → x1 (no slowdown) regardless of level, since the
//                rider has compensated power input
export const BATTERY_LOW_LEVEL = 0.3;
export const BATTERY_CRITICAL_LEVEL = 0.15;

// Minimal subset of the Battery Status API we consume. Firefox + many
// mobile Chromiums still expose `navigator.getBattery()`; desktop
// Chrome removed it in 2020 but the courier app runs as a PWA on
// mobile + via Capacitor wrappers, both of which retain the API.
type BatteryManager = {
  level: number;
  charging: boolean;
  addEventListener: (event: string, handler: () => void) => void;
  removeEventListener: (event: string, handler: () => void) => void;
};

type NavigatorWithBattery = Navigator & {
  getBattery?: () => Promise<BatteryManager>;
};

export type BatterySnapshot = { level: number; charging: boolean } | null;

// Custom hook: subscribes to the Battery API (when available) and
// returns the current snapshot. Returns null on platforms that don't
// expose the API — callers fall back to non-adaptive defaults so
// behaviour never regresses on unsupported browsers.
export function useBatterySnapshot(): BatterySnapshot {
  const [snapshot, setSnapshot] = useState<BatterySnapshot>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const nav = navigator as NavigatorWithBattery;
    if (typeof nav.getBattery !== 'function') return;

    let mounted = true;
    let battery: BatteryManager | null = null;

    const onChange = () => {
      if (!mounted || !battery) return;
      setSnapshot({ level: battery.level, charging: battery.charging });
    };

    nav
      .getBattery()
      .then((b) => {
        if (!mounted) return;
        battery = b;
        setSnapshot({ level: b.level, charging: b.charging });
        b.addEventListener('levelchange', onChange);
        b.addEventListener('chargingchange', onChange);
      })
      .catch(() => {
        // Some browsers reject for permissions reasons; degrade silently.
      });

    return () => {
      mounted = false;
      if (battery) {
        battery.removeEventListener('levelchange', onChange);
        battery.removeEventListener('chargingchange', onChange);
      }
    };
  }, []);

  return snapshot;
}

// Apply the multiplier to the base interval. Pure function for unit-
// test friendliness if/when we add coverage. Charging skips slowdown.
export function adaptiveIntervalMs(baseMs: number, battery: BatterySnapshot): number {
  if (!battery || battery.charging) return baseMs;
  if (battery.level <= BATTERY_CRITICAL_LEVEL) return baseMs * 4;
  if (battery.level <= BATTERY_LOW_LEVEL) return baseMs * 2;
  return baseMs;
}

/**
 * Watches the courier's geolocation while the dashboard is open and
 * forwards each fix to the server via the `updateCourierLocation`
 * server action passed in as `onFix`. The server action persists to
 * `courier_shifts.last_lat / last_lng / last_seen_at` for the courier's
 * currently-ONLINE shift; if no shift is ONLINE the action is a no-op.
 *
 * Throttling is intentionally simple: we forward at most one fix every
 * `intervalMs` (default 30s). HTML5 `watchPosition` may emit faster on
 * some platforms — extra fixes are dropped client-side to spare battery
 * and the DB.
 *
 * Permission UX:
 *   - On first mount, permission is `prompt` → we DO NOT auto-prompt.
 *     We wait until the courier has actually started a shift (a parent
 *     hint via `enabled=true`). Iulian's `<EarningsBar />` already
 *     renders the online state; this component piggybacks on the same
 *     server-provided `isOnline` flag.
 *   - On `granted` → start watchPosition immediately.
 *   - On `denied` → render nothing, log to console; no nag.
 *
 * Battery + privacy notes:
 *   - We use `enableHighAccuracy: false` (cell + wifi triangulation is
 *     enough at street level; high-accuracy GPS drains battery fast).
 *   - We never call `getCurrentPosition` outside a shift.
 *   - `unmount` cleanly clears the watch.
 *
 * This component renders nothing — it's a side-effect-only sentinel.
 */
type Props = {
  enabled: boolean;
  intervalMs?: number;
  onFix: (lat: number, lng: number) => Promise<void> | void;
};

export function LocationTracker({ enabled, intervalMs = 30_000, onFix }: Props) {
  const lastSentAtRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const battery = useBatterySnapshot();

  // Effective interval reacts to battery state. The watchPosition handler
  // reads the ref, not a closure, so a charging→discharging transition
  // takes effect on the very next fix without re-creating the watch.
  const effectiveIntervalRef = useRef<number>(intervalMs);
  effectiveIntervalRef.current = adaptiveIntervalMs(intervalMs, battery);

  useEffect(() => {
    if (!enabled) {
      // Stop any in-flight watch when shift goes offline.
      if (watchIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;

    // Honour a prior dismissal of the prompt for 7 days.
    const dismissedAtRaw = window.localStorage.getItem(LOCATION_DISMISS_KEY);
    const dismissedAt = dismissedAtRaw ? Number(dismissedAtRaw) : 0;
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) {
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        // Read the live interval — adaptive on battery state — instead of
        // a stale closure capture, so the watch doesn't need to be torn
        // down and re-created every time the battery level changes.
        if (now - lastSentAtRef.current < effectiveIntervalRef.current) return;
        lastSentAtRef.current = now;
        // Best-effort; never throw inside the callback (would kill the watch).
        Promise.resolve(onFix(pos.coords.latitude, pos.coords.longitude)).catch((err) => {
          console.error('[location-tracker] onFix failed', err);
        });
      },
      (err) => {
        // PERMISSION_DENIED (1) — record dismissal so we don't re-prompt next mount.
        if (err.code === err.PERMISSION_DENIED) {
          window.localStorage.setItem(LOCATION_DISMISS_KEY, String(Date.now()));
        } else {
          console.warn('[location-tracker] watchPosition error', err.code, err.message);
        }
      },
      {
        enableHighAccuracy: false,
        maximumAge: 15_000,
        timeout: 20_000,
      },
    );

    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
    // Only re-create the watch when `enabled` flips or `onFix` rotates.
    // Battery changes are absorbed via the ref above so the watch keeps
    // streaming uninterrupted.
  }, [enabled, onFix]);

  return null;
}

// Export the helpers so a future battery-saver UI badge (rider sees
// "Mod economisire baterie activ" when the throttle kicks in) can read
// the same multipliers without re-deriving them.
export const __INTERNAL_FOR_TESTING = {
  adaptiveIntervalMs,
  BATTERY_LOW_LEVEL,
  BATTERY_CRITICAL_LEVEL,
};
