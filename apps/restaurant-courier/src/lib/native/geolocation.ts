'use client';

/**
 * Unified geolocation bridge: Capacitor native (Android) or browser PWA.
 *
 * Native Android (shift reporter): watchPosition() uses
 * @capacitor-community/background-geolocation, which runs a foreground service
 * with a persistent notification so position keeps flowing while the screen is
 * locked or the app is backgrounded — DURING AN ACTIVE SHIFT only. The watcher
 * is started by LocationTracker when the shift is ONLINE and removed on OFFLINE.
 * It requests ACCESS_BACKGROUND_LOCATION (Android 10+ two-step "Allow all the
 * time"); that permission is declared via the CI manifest patch
 * (scripts/patch-android-manifest.mjs) because the plugin does NOT bundle it.
 *
 * Browser / PWA: falls back to navigator.geolocation.watchPosition (foreground).
 *
 * getCurrentPosition() (one-shot initial fix) stays on @capacitor/geolocation.
 *
 * This module is a drop-in replacement for navigator.geolocation usage; callers
 * never check Capacitor directly. The prominent disclosure required before the
 * OS background prompt lives in background-location-rationale.tsx and gates the
 * watcher start (see useBgLocationDisclosureGate).
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';

// Cache the plugin proxy once (registerPlugin is cheap + idempotent) so both
// addWatcher and the cleanup's removeWatcher use the SAME instance without a
// per-call dynamic import — keeps teardown ordered vs. the next addWatcher.
let bgPluginRef: BackgroundGeolocationPlugin | null = null;
function getBgPlugin(): BackgroundGeolocationPlugin {
  if (!bgPluginRef) {
    bgPluginRef = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');
  }
  return bgPluginRef;
}

export type GeoPosition = {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
};

export type GeoPermission = 'idle' | 'prompt' | 'granted' | 'denied' | 'unavailable';

export type WatchCallback = (pos: GeoPosition) => void;
export type ErrorCallback = (permission: GeoPermission, message: string) => void;

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 10000,
};

/**
 * Start watching position. Returns a cleanup function that stops the watch.
 *
 * Throttle: the caller (useCourierGeolocation) is responsible for the
 * 1-post/sec server throttle — this bridge emits every raw position.
 */
export function watchPosition(
  onPosition: WatchCallback,
  onError: ErrorCallback,
): () => void {
  // ── Native path (background-geolocation foreground service) ───────────────
  // @capacitor-community/background-geolocation runs an Android foreground
  // service, so fixes keep arriving when the screen is locked or the app is
  // backgrounded — required for a courier who is online but not looking at the
  // app. addWatcher drives the Android 10+ two-step permission request
  // (foreground, then "Allow all the time") and shows the persistent
  // notification itself. ACCESS_BACKGROUND_LOCATION is NOT bundled by the
  // plugin — it is injected into the generated manifest by the CI step
  // scripts/patch-android-manifest.mjs.
  if (Capacitor.isNativePlatform()) {
    let cancelled = false;
    let watcherId: string | null = null;
    let pluginRef: BackgroundGeolocationPlugin | null = null;

    void (async () => {
      try {
        const Bg = getBgPlugin();
        pluginRef = Bg;
        const id = await Bg.addWatcher(
          {
            backgroundTitle: 'HIR Curier — ești online',
            backgroundMessage: 'Urmărim poziția ca să-ți trimitem comenzi din zonă.',
            requestPermissions: true,
            stale: false,
            distanceFilter: 25,
          },
          (location, error) => {
            if (error) {
              if (error.code === 'NOT_AUTHORIZED') {
                onError(
                  'denied',
                  'Pentru a rămâne online cu ecranul stins, activează „Permite tot timpul" din Setări.',
                );
              } else {
                onError('granted', error.message ?? 'Eroare GPS');
              }
              return;
            }
            if (!location || cancelled) return;
            onPosition({
              lat: location.latitude,
              lng: location.longitude,
              accuracy: location.accuracy,
              heading: location.bearing ?? null,
              speed: location.speed ?? null,
            });
          },
        );
        if (cancelled) {
          void Bg.removeWatcher({ id });
          return;
        }
        watcherId = id;
      } catch (e) {
        onError('unavailable', e instanceof Error ? e.message : 'Geolocation error');
      }
    })();

    // Sync-dispatch teardown using the cached plugin instance (no second
    // dynamic import) so removeWatcher is ordered relative to the next
    // addWatcher on a fast OFFLINE→ONLINE toggle.
    return () => {
      cancelled = true;
      if (pluginRef && watcherId !== null) {
        void pluginRef.removeWatcher({ id: watcherId });
      }
    };
  }

  // ── Browser / PWA path ───────────────────────────────────────────────────
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError('unavailable', 'Geolocation nu este suportată pe acest dispozitiv.');
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      onPosition({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
      });
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        onError('denied', 'Permisiunea pentru locație a fost refuzată. Activați locația din setările browserului.');
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        onError('granted', 'Semnalul GPS nu este disponibil momentan.');
      } else {
        onError('granted', err.message);
      }
    },
    WATCH_OPTIONS,
  );

  return () => navigator.geolocation.clearWatch(watchId);
}

/**
 * Request a one-time position (used for initial fix on shift start).
 */
export async function getCurrentPosition(): Promise<GeoPosition | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
      };
    } catch {
      return null;
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
        }),
      () => resolve(null),
      WATCH_OPTIONS,
    );
  });
}
