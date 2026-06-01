'use client';

/**
 * Unified geolocation bridge: Capacitor native (iOS/Android) or browser PWA.
 *
 * Launch posture is FOREGROUND-ONLY. We request the `location` permission
 * (Android "While using the app" / iOS "When in use"). We do NOT request
 * ACCESS_BACKGROUND_LOCATION — tracking is scoped to while the app is open
 * with the shift active.
 *
 * In a Capacitor native shell:
 *   - Uses @capacitor/geolocation (foreground watch).
 *   - iOS: WKWebView background geolocation not used in the launch build.
 *
 * In a browser / PWA:
 *   - Falls back to navigator.geolocation.watchPosition.
 *
 * This module is a drop-in replacement for any existing usage of
 * navigator.geolocation. Callers never need to check Capacitor directly.
 *
 * TODO(post-launch): background geolocation via
 * @capacitor-community/background-geolocation — see STORE-DEPLOYMENT.md /
 * NATIVE_SHELL.md ("post-launch"). Requires ACCESS_BACKGROUND_LOCATION grant
 * + foreground service; intentionally deferred for the Google Play launch.
 */

import { Capacitor } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';

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
  // notification itself; its manifest fragment is merged by Gradle on
  // `cap sync`, so the throwaway android/ dir never needs hand-editing.
  if (Capacitor.isNativePlatform()) {
    let cancelled = false;
    let watcherId: string | null = null;

    void (async () => {
      try {
        const { registerPlugin } = await import('@capacitor/core');
        const Bg = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');
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

    return () => {
      cancelled = true;
      if (watcherId !== null) {
        void import('@capacitor/core').then(({ registerPlugin }) => {
          const Bg = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');
          void Bg.removeWatcher({ id: watcherId as string });
        });
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
