'use client';

import { useEffect, useRef } from 'react';

const LOCATION_DISMISS_KEY = 'hir.courier.locationPromptDismissedAt';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
        if (now - lastSentAtRef.current < intervalMs) return;
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
  }, [enabled, intervalMs, onFix]);

  return null;
}
