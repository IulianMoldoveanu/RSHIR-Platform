'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Native-shell bootstrap. Mounted once inside the dashboard layout. Runs
 * Capacitor-only side effects on mount:
 *   - `initDeepLinkListener` for `hir-curier://order/:id` cold-start +
 *     warm appUrlOpen navigation via Next router.
 *   - `registerForPush` so the FCM/APNs token reaches courier-push-register.
 *
 * On the web / PWA path the native bridges short-circuit via
 * `Capacitor.isNativePlatform()` so this component is effectively a no-op —
 * the existing <PushBootstrap> still drives web VAPID for browser users.
 */
export function CapacitorBootstrap() {
  const router = useRouter();

  useEffect(() => {
    let cleanupDeepLink: (() => void) | null = null;
    let cleanupPushTap: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;

      // Deep links: hir-curier://order/<id> → /dashboard/orders/<id>
      const { initDeepLinkListener } = await import('@/lib/native/deep-link');
      if (cancelled) return;
      cleanupDeepLink = initDeepLinkListener((path) => router.push(path));

      // Push tap → navigate. notification.data.orderId from courier-push-dispatch.
      const { initPushTapListener } = await import('@/lib/native/push');
      if (cancelled) return;
      cleanupPushTap = initPushTapListener((path) => router.push(path));

      // Native push registration. Token is upserted into courier_push_tokens
      // by the Edge Function; failures are non-fatal — the courier can still
      // receive in-app realtime updates without push.
      try {
        const { getBrowserSupabase } = await import('@/lib/supabase/browser');
        const supabase = getBrowserSupabase();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const { registerForPush } = await import('@/lib/native/push');
        await registerForPush(token);
      } catch (e) {
        console.warn('[capacitor-bootstrap] push registration failed', e);
      }
    })();

    return () => {
      cancelled = true;
      cleanupDeepLink?.();
      cleanupPushTap?.();
    };
    // router is stable for the lifetime of the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
