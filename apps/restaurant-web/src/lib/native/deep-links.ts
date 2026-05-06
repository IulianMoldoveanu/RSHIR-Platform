'use client';

/**
 * Deep-link handler for the HIR Storefront native shell.
 *
 * Supported schemes:
 *   hir://restaurant/{slug}          → restaurant storefront (/r/{slug})
 *   hir://track/{token}              → order tracking (/track/{token})
 *   https://hir.ro/r/{slug}          → universal link → restaurant page
 *   https://hir.ro/track/{token}     → universal link → track page
 *
 * Universal links (iOS) and App Links (Android) require server-side
 * configuration files that are added once Capacitor is installed:
 *   iOS: apple-app-site-association  (at public/.well-known/)
 *   Android: assetlinks.json         (at public/.well-known/)
 * See mobile/README.md for the exact JSON format and hosting instructions.
 *
 * ACTIVATION: once @capacitor/app is installed, uncomment the listener
 * below and call initDeepLinkHandler() from your root layout.
 */

/** Parses a deep-link URL and returns the web path to navigate to. */
export function resolveDeepLink(url: string): string | null {
  try {
    const parsed = new URL(url);

    // Custom scheme: hir://restaurant/{slug} or hir://track/{token}
    if (parsed.protocol === 'hir:') {
      const host = parsed.hostname; // "restaurant" or "track"
      const [, slug] = parsed.pathname.split('/').filter(Boolean);
      if (host === 'restaurant' && slug) return `/r/${encodeURIComponent(slug)}`;
      if (host === 'track' && slug) return `/track/${encodeURIComponent(slug)}`;
    }

    // Universal links: https://hir.ro/r/{slug} or https://hir.ro/track/{token}
    if (parsed.hostname.endsWith('hir.ro') || parsed.hostname.endsWith('hiraisolutions.ro')) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts[0] === 'r' && parts[1]) return `/r/${encodeURIComponent(parts[1])}`;
      if (parts[0] === 'track' && parts[1]) return `/track/${encodeURIComponent(parts[1])}`;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Register the Capacitor App deep-link listener.
 *
 * Call once from the root client component. The listener intercepts
 * `appUrlOpen` events (triggered when the OS opens the app via a deep link)
 * and navigates the WebView to the correct in-app route.
 *
 * @param navigate - Next.js router.push (or window.location.href assignment)
 *
 * ACTIVATION: uncomment the import and body once @capacitor/app is installed.
 */
export async function initDeepLinkHandler(navigate: (path: string) => void): Promise<() => void> {
  // --- Native path (@capacitor/app) ---
  // Uncomment once @capacitor/app is installed:
  //
  // const { App } = await import('@capacitor/app');
  // const handle = await App.addListener('appUrlOpen', (event) => {
  //   const path = resolveDeepLink(event.url);
  //   if (path) navigate(path);
  // });
  // // Check if the app was opened with a URL (cold start deep link).
  // const { url } = await App.getLaunchUrl() ?? {};
  // if (url) {
  //   const path = resolveDeepLink(url);
  //   if (path) navigate(path);
  // }
  // return () => handle.remove();

  // Browser path: no-op (deep links are handled by the browser URL bar directly).
  return () => {};
}
