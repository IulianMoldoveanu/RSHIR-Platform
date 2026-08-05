'use client';

import { useEffect, useRef, useState } from 'react';
import {
  watchPosition as bridgeWatchPosition,
  getCurrentPosition,
} from '@/lib/native/geolocation';
import { useBgLocationDisclosureGate } from '@/components/background-location-rationale';

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
 *   - This is the dispatch reporter, so the underlying bridge
 *     (`lib/native/geolocation.ts`) uses `enableHighAccuracy: true` for an
 *     accurate street-level fix. Battery is managed instead by the adaptive
 *     throttle below (we forward at most one fix per `effectiveIntervalRef`,
 *     which lengthens on low/discharging battery) and by only running while
 *     a shift is ONLINE. The ETA/map watchers use low accuracy — see
 *     `live-eta.tsx` / `rider-map.tsx`.
 *   - We never call `getCurrentPosition` outside a shift.
 *   - `unmount` cleanly clears the watch.
 *
 * This component renders nothing — it's a side-effect-only sentinel.
 */
// How often to re-report the last known position when nothing has moved.
//
// Position watchers are change-driven: the browser emits nothing while a
// courier stands still, and the native Android watcher is explicitly set to
// distanceFilter: 25, so it stays silent until they travel 25 metres. But
// fn_auto_dispatch_sweep (20260804_007) refuses any courier whose
// courier_shifts.last_seen_at is older than five minutes — so a courier
// waiting at a restaurant would drop out of dispatch while looking online,
// and simply stop being offered work until they happened to move.
//
// 2 minutes leaves a 2.5x margin against that five-minute rule while costing
// one small request per interval. Verified against a live deployment: 70
// seconds stationary produced no position event at all.
export const HEARTBEAT_MS = 120_000;

type Props = {
  enabled: boolean;
  intervalMs?: number;
  heartbeatMs?: number;
  // `accuracyM` is the device's reported horizontal accuracy radius. The
  // server uses it to decide whether a fix is precise enough to enter the
  // distance trail; it is undefined on platforms that don't report one.
  onFix: (lat: number, lng: number, accuracyM?: number) => Promise<void> | void;
};

export function LocationTracker({
  enabled,
  intervalMs = 30_000,
  heartbeatMs = HEARTBEAT_MS,
  onFix,
}: Props) {
  const lastSentAtRef = useRef<number>(0);
  const lastPosRef = useRef<{ lat: number; lng: number; accuracy?: number } | null>(null);
  // What was last actually forwarded, so the keepalive can tell a genuinely
  // new position from a repeat of one the server already has.
  const lastSentPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const stopWatchRef = useRef<(() => void) | null>(null);
  const battery = useBatterySnapshot();
  // On native Android the background watcher must not start (and thus must not
  // trigger the OS "Allow all the time" prompt) before the prominent disclosure
  // is acknowledged. True immediately on web / non-Android.
  const disclosureReady = useBgLocationDisclosureGate();

  // Effective interval reacts to battery state. The watchPosition handler
  // reads the ref, not a closure, so a charging→discharging transition
  // takes effect on the very next fix without re-creating the watch.
  const effectiveIntervalRef = useRef<number>(intervalMs);
  effectiveIntervalRef.current = adaptiveIntervalMs(intervalMs, battery);

  // `onFix` is a server action handed down from the (server-rendered) dashboard
  // layout, so it arrives as a fresh function on every soft refresh — and the
  // courier's dashboard soft-refreshes on every realtime order event. Kept in
  // the dependency array it would tear down and re-create the high-accuracy
  // watch, and re-fire the one-shot below, each time an offer landed: measured
  // on production at +15s into a 30s throttle window. Held in a ref instead, so
  // the watch survives refreshes and the one-shot means what it says — tracking
  // just started.
  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;

  useEffect(() => {
    if (!enabled || !disclosureReady) {
      // Stop any in-flight watch when the shift goes offline, OR hold off
      // starting until the background-location disclosure is acknowledged.
      stopWatchRef.current?.();
      stopWatchRef.current = null;
      // Forget where they were. A cached fix belongs to the watcher session
      // that produced it — replaying it into a later shift would report the
      // courier at a place they may have left hours ago.
      lastPosRef.current = null;
      lastSentPosRef.current = null;
      return;
    }

    if (typeof window === 'undefined') return;

    // Seed an immediate one-shot fix the moment the shift goes online, so the
    // courier is visible to dispatch (and gets nearby offers) right away — the
    // native background watcher only emits after ~25m of movement, so a
    // stationary courier who just went online would otherwise have no
    // last_lat/lng until they start moving. Best-effort; ignored on failure.
    void getCurrentPosition()
      .then((pos) => {
        if (!pos) return;
        lastSentAtRef.current = Date.now();
        lastPosRef.current = { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy };
        lastSentPosRef.current = { lat: pos.lat, lng: pos.lng };
        return onFixRef.current(pos.lat, pos.lng, pos.accuracy);
      })
      .catch(() => {
        // No initial fix (permission/timeout) — the watcher will catch up.
      });

    // Unified bridge: native Capacitor Geolocation on Android/iOS (foreground
    // tracking only at launch — see geolocation.ts), navigator.geolocation in
    // the web/PWA fallback. The bridge handles permission resolution per
    // platform. TODO(post-launch): background tracking via
    // @capacitor-community/background-geolocation.
    const stop = bridgeWatchPosition(
      (pos) => {
        const now = Date.now();
        // Remember the freshest position BEFORE deciding whether to forward
        // it. A fix that arrives inside the throttle window is still the
        // truth about where the courier is — if we only recorded the ones we
        // send, the heartbeat below would keep re-reporting a position the
        // courier has already left.
        lastPosRef.current = { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy };
        // Read the live interval — adaptive on battery state — instead of
        // a stale closure capture, so the watch doesn't need to be torn
        // down and re-created every time the battery level changes.
        if (now - lastSentAtRef.current < effectiveIntervalRef.current) return;
        lastSentAtRef.current = now;
        lastSentPosRef.current = { lat: pos.lat, lng: pos.lng };
        // Best-effort; never throw inside the callback (would kill the watch).
        Promise.resolve(onFixRef.current(pos.lat, pos.lng, pos.accuracy)).catch((err) => {
          console.error('[location-tracker] onFix failed', err);
        });
      },
      (permission, message) => {
        // Don't cache dismissals: the OS itself remembers a hard "deny", but a
        // soft dismissal should let the prompt reappear next time the courier
        // opens the app / goes on shift — otherwise the GPS prompt silently
        // never shows again.
        console.warn('[location-tracker] watchPosition error', permission, message);
        // A denied permission mid-shift means the dispatch reporter has stopped
        // feeding the server — the courier looks online but is invisible to
        // dispatch and stops getting nearby offers. Surface it so a recovery
        // banner can prompt re-enabling (previously swallowed to console only,
        // leaving the courier to silently lose orders for a whole shift).
        // ANY error means the watcher could not give us a position just now,
        // so the cached one stops being evidence of anything. Drop it: a
        // courier whose GPS has died must age out of dispatch rather than keep
        // looking fresh at their last known corner while jobs are offered to
        // them there.
        //
        // Deliberately not narrowed to permission errors. The bridge reports
        // POSITION_UNAVAILABLE — plain signal loss, the common case — as
        // `granted`, because the permission genuinely is fine; a guard keyed on
        // permission misses exactly the situation it was written for.
        //
        // Transient timeouts clear it too, and that is the right trade: we
        // would rather stop offering work than route it to a position we
        // cannot confirm. Recovery is automatic — the next good fix repopulates
        // the cache and presence resumes.
        lastPosRef.current = null;
        lastSentPosRef.current = null;
        if (permission === 'denied') {
          try {
            window.dispatchEvent(new CustomEvent('hir:location-denied', { detail: { message } }));
          } catch {
            // window unavailable (SSR) — ignore.
          }
        }
      },
    );

    stopWatchRef.current = stop;

    return () => {
      stopWatchRef.current?.();
      stopWatchRef.current = null;
    };
    // Re-create the watch only when tracking genuinely starts or stops.
    // Battery changes and a rotating `onFix` are absorbed via refs so the watch
    // keeps streaming uninterrupted.
  }, [enabled, disclosureReady]);

  // Backstop for the two ways the watch path alone leaves the server with a
  // wrong or stale picture:
  //
  //   * The courier stopped moving, so the watcher emits nothing at all and
  //     presence goes stale — which drops them out of auto-dispatch after five
  //     minutes (see HEARTBEAT_MS). Re-report the position we already hold.
  //   * The courier moved, but the fix landed inside the throttle window and
  //     was not forwarded. Flush it the moment the window opens instead of
  //     waiting for the next watcher event, which may never come if they have
  //     now parked.
  //
  // Either way this re-sends a position already in hand rather than requesting
  // a new fix, so it costs no GPS power. The server's displacement filter keeps
  // an unchanged repeat out of the distance trail while still refreshing
  // presence.
  useEffect(() => {
    if (!enabled || !disclosureReady) return;
    if (typeof window === 'undefined') return;

    const timer = window.setInterval(() => {
      const pos = lastPosRef.current;
      if (!pos) return;

      const sinceSent = Date.now() - lastSentAtRef.current;
      const sent = lastSentPosRef.current;
      const isNew = !sent || sent.lat !== pos.lat || sent.lng !== pos.lng;

      // Something new waits only on the ordinary throttle; an unchanged
      // position waits for the much longer heartbeat.
      const due = isNew
        ? sinceSent >= effectiveIntervalRef.current
        : sinceSent >= heartbeatMs;
      if (!due) return;

      lastSentAtRef.current = Date.now();
      lastSentPosRef.current = { lat: pos.lat, lng: pos.lng };
      Promise.resolve(onFixRef.current(pos.lat, pos.lng, pos.accuracy)).catch((err) => {
        console.error('[location-tracker] keepalive onFix failed', err);
      });
    }, 15_000);

    return () => window.clearInterval(timer);
    // `onFix` is deliberately absent — see the ref above. Restarting this
    // interval on every soft refresh would keep resetting its 15s tick, so a
    // courier receiving offers steadily could have the heartbeat never fire.
  }, [enabled, disclosureReady, heartbeatMs]);

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
