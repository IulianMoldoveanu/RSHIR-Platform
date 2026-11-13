'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Registers the service worker on every web load, from the root layout.
 *
 * It used to be registered from `<PushBootstrap>`, which only mounts under
 * /dashboard — so on the sign-in screen there was no worker at all. That is
 * the one page where it matters most: it is where the install prompt now
 * appears, and `beforeinstallprompt` is about what the browser can install,
 * which is decided while that page is open. It is also when the worker's
 * install step pre-caches the offline fallback.
 *
 * Native builds are skipped: `<CapacitorBootstrap>` owns that lifecycle, and
 * there is no browser service worker to register inside the native shell.
 *
 * Registration is idempotent — the browser hands back the existing
 * registration when the worker is already installed — and notification
 * permission is still asked for only by the push flow, never here.
 */
export function ServiceWorkerBootstrap() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    void import('@/lib/push/register-sw').then((m) => m.ensureServiceWorker());
  }, []);

  return null;
}
