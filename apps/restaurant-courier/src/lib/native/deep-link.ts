'use client';

/**
 * Deep link handler for the Capacitor native shell.
 *
 * Handles:
 *   hir-curier://order/<id>     → navigate to /dashboard/orders/<id>
 *   hir-curier://shift          → navigate to /dashboard/shift
 *   https://courier.hirforyou.ro/orders/<id>  (universal / app links)
 *
 * Browser / PWA: no-op (the browser handles URL navigation natively).
 *
 * Call initDeepLinkListener once on app mount (e.g. in the root layout
 * client component). Pass a Next.js router.push function.
 */

import { Capacitor } from '@capacitor/core';

type NavigateFn = (path: string) => void;

const CUSTOM_SCHEME = 'hir-curier://';
const UNIVERSAL_HOST = 'courier.hirforyou.ro';

function urlToPath(url: string): string | null {
  try {
    // Custom scheme: hir-curier://order/abc → /dashboard/orders/abc
    if (url.startsWith(CUSTOM_SCHEME)) {
      const path = url.slice(CUSTOM_SCHEME.length);
      const [segment, ...rest] = path.split('/');
      if (segment === 'order' && rest[0]) return `/dashboard/orders/${rest[0]}`;
      if (segment === 'shift') return '/dashboard/shift';
      return null;
    }

    // Universal link: https://courier.hirforyou.ro/...
    const parsed = new URL(url);
    if (parsed.hostname === UNIVERSAL_HOST) {
      return parsed.pathname;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Start listening for deep links. Returns a cleanup function.
 * Safe to call in browser — returns a no-op cleanup immediately.
 */
export function initDeepLinkListener(navigate: NavigateFn): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  let listenerHandle: { remove: () => void } | null = null;

  void (async () => {
    const { App } = await import('@capacitor/app');

    // Handle the URL that launched the app (cold-start deep link)
    const launchUrl = await App.getLaunchUrl();
    if (launchUrl?.url) {
      const path = urlToPath(launchUrl.url);
      if (path) navigate(path);
    }

    // Handle URLs when app is already running (warm deep link)
    const handle = await App.addListener('appUrlOpen', (data) => {
      const path = urlToPath(data.url);
      if (path) navigate(path);
    });
    listenerHandle = handle;
  })();

  return () => { listenerHandle?.remove(); };
}
