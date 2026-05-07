'use client';

/**
 * Capacitor-aware geolocation shim.
 *
 * When running in a Capacitor native shell (iOS/Android), the Capacitor
 * Geolocation plugin is preferred because:
 *   - Android: background location requires the native plugin.
 *   - iOS: WKWebView restricts background geolocation for PWAs; native
 *     plugin works even when the app is backgrounded during a delivery.
 *
 * When running in a browser (PWA, dev), falls back to
 * navigator.geolocation — no Capacitor dependency needed.
 *
 * Usage — drop-in replacement for the existing useCourierGeolocation hook.
 * The hook already calls this indirectly via the browser API; this file
 * provides the Capacitor path once the native plugin is installed.
 *
 * ACTIVATION: remove the `typeof window === 'undefined'` early return guard
 * and import Capacitor Geolocation from '@capacitor/geolocation' once the
 * package is installed.
 */

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

/** Returns true when running inside a Capacitor native shell. */
function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  // Capacitor sets window.Capacitor.isNativePlatform() once loaded.
  const cap = (window as unknown as Record<string, unknown>)['Capacitor'] as
    | { isNativePlatform?: () => boolean }
    | undefined;
  return cap?.isNativePlatform?.() ?? false;
}

/**
 * Start watching position.
 *
 * In the native shell: delegates to Capacitor Geolocation (when installed).
 * In the browser: uses navigator.geolocation.watchPosition.
 *
 * Returns a cleanup function that stops the watch.
 */
export function watchPosition(
  onPosition: WatchCallback,
  onError: ErrorCallback,
): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError('unavailable', 'Geolocation is not supported on this device.');
    return () => {};
  }

  // --- Native path (Capacitor Geolocation plugin) ---
  // When @capacitor/geolocation is installed, uncomment this block:
  //
  // if (isNativeShell()) {
  //   import('@capacitor/geolocation').then(({ Geolocation }) => {
  //     Geolocation.requestPermissions().then((perm) => {
  //       if (perm.location !== 'granted') {
  //         onError('denied', 'Location permission denied.');
  //         return;
  //       }
  //       let watchId: string;
  //       Geolocation.watchPosition(
  //         { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
  //         (pos, err) => {
  //           if (err) { onError('granted', err.message); return; }
  //           if (!pos) return;
  //           onPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude,
  //             accuracy: pos.coords.accuracy, heading: pos.coords.heading,
  //             speed: pos.coords.speed });
  //         },
  //       ).then((id) => { watchId = id; });
  //       cleanup = () => Geolocation.clearWatch({ id: watchId });
  //     });
  //   });
  //   return cleanup;
  // }

  // --- Browser path (PWA / dev) ---
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
