'use client';

/**
 * Deep-link handler for the HIR Admin native shell.
 *
 * Supported schemes:
 *   hir-admin://order/{id}         → order detail (/dashboard/orders/{id})
 *   hir-admin://kds                → KDS view (/dashboard/kds)
 *   hir-admin://dashboard          → main dashboard (/dashboard)
 *
 * Deep links are triggered by push notification taps. The Supabase Edge
 * Function `admin-push-dispatch` includes the deep-link URL in the
 * notification payload so tapping "Comanda nouă #1234" opens the order
 * detail directly without navigating manually.
 *
 * No universal links needed for admin (no public URLs that should open the
 * native app). Custom scheme only.
 *
 * ACTIVATION: uncomment the listener once @capacitor/app is installed.
 */

/** Parses an admin deep-link URL and returns the web path to navigate to. */
export function resolveAdminDeepLink(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'hir-admin:') return null;

    const host = parsed.hostname;
    const [, ...rest] = parsed.pathname.split('/').filter(Boolean);

    if (host === 'order' && rest[0]) {
      return `/dashboard/orders/${encodeURIComponent(rest[0])}`;
    }
    if (host === 'kds') return '/dashboard/kds';
    if (host === 'dashboard') return '/dashboard';

    return null;
  } catch {
    return null;
  }
}

/**
 * Register the Capacitor App deep-link listener for admin.
 *
 * Call once from the root client component. Intercepts `appUrlOpen` events
 * (triggered when the OS opens the app via a push notification tap or
 * direct custom-scheme link) and navigates to the correct route.
 *
 * @param navigate - Next.js router.push (or window.location.href assignment)
 *
 * ACTIVATION: uncomment the import and body once @capacitor/app is installed.
 */
export async function initAdminDeepLinkHandler(
  navigate: (path: string) => void,
): Promise<() => void> {
  // --- Native path (@capacitor/app) ---
  // Uncomment once @capacitor/app is installed:
  //
  // const { App } = await import('@capacitor/app');
  // const handle = await App.addListener('appUrlOpen', (event) => {
  //   const path = resolveAdminDeepLink(event.url);
  //   if (path) navigate(path);
  // });
  // const { url } = await App.getLaunchUrl() ?? {};
  // if (url) {
  //   const path = resolveAdminDeepLink(url);
  //   if (path) navigate(path);
  // }
  // return () => handle.remove();

  return () => {};
}
