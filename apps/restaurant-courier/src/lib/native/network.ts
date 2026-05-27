'use client';

/**
 * Network status bridge.
 *
 * Native (Capacitor): uses @capacitor/network which is more reliable on
 * Android/iOS than the browser online/offline events (especially on Android
 * where the browser event can lag the real connectivity state by seconds).
 *
 * Browser / PWA: uses navigator.onLine + window online/offline events.
 *
 * Usage:
 *   const stop = watchNetwork((isOnline) => setOnline(isOnline));
 *   // call stop() on component unmount
 */

import { Capacitor } from '@capacitor/core';

export type NetworkCallback = (isOnline: boolean) => void;

/**
 * Subscribe to network status changes.
 * Calls the callback immediately with the current status, then on each change.
 * Returns a cleanup function.
 */
export function watchNetwork(onChange: NetworkCallback): () => void {
  // ── Native path ──────────────────────────────────────────────────────────
  if (Capacitor.isNativePlatform()) {
    let listenerHandle: { remove: () => void } | null = null;

    void (async () => {
      const { Network } = await import('@capacitor/network');

      // Emit current state immediately
      const status = await Network.getStatus();
      onChange(status.connected);

      // Subscribe to changes
      const handle = await Network.addListener('networkStatusChange', (s) => {
        onChange(s.connected);
      });
      listenerHandle = handle;
    })();

    return () => { listenerHandle?.remove(); };
  }

  // ── Browser / PWA path ───────────────────────────────────────────────────
  if (typeof window === 'undefined') return () => {};

  // Emit current state immediately
  onChange(navigator.onLine);

  const handleOnline = () => onChange(true);
  const handleOffline = () => onChange(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * One-shot check: returns true if the device currently has network access.
 */
export async function isOnline(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const { Network } = await import('@capacitor/network');
    const status = await Network.getStatus();
    return status.connected;
  }
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
