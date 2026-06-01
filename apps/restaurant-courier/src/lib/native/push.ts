'use client';

/**
 * Unified push notification bridge: Capacitor native FCM/APNs or browser VAPID.
 *
 * Native shell (Android → FCM, iOS → APNs):
 *   - Requests permission via @capacitor/push-notifications.
 *   - On registration, POSTs the device token to the courier-push-register
 *     Edge Function which upserts into courier_push_tokens table.
 *
 * Browser / PWA:
 *   - Delegates to the existing VAPID web-push flow (src/lib/push/register-sw).
 */

import { Capacitor } from '@capacitor/core';

export type PushRegistrationResult =
  | { status: 'registered'; token: string; platform: 'ios' | 'android' }
  | { status: 'subscribed'; endpoint: string; platform: 'web' }
  | { status: 'denied' }
  | { status: 'unsupported' }
  | { status: 'not-configured' };

/**
 * Register for push notifications.
 *
 * Pass the Supabase access token so the Edge Function can authenticate
 * the token registration call.
 */
export async function registerForPush(
  supabaseAccessToken: string,
): Promise<PushRegistrationResult> {
  // ── Native path (Capacitor PushNotifications) ────────────────────────────
  if (Capacitor.isNativePlatform()) {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return { status: 'denied' };

    await PushNotifications.register();

    return new Promise<PushRegistrationResult>((resolve) => {
      const registrationHandler = PushNotifications.addListener(
        'registration',
        async (token) => {
          void registrationHandler.then((h) => h.remove());

          const platform = Capacitor.getPlatform() as 'ios' | 'android';
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

          if (supabaseUrl) {
            try {
              await fetch(`${supabaseUrl}/functions/v1/courier-push-register`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${supabaseAccessToken}`,
                },
                body: JSON.stringify({ native_token: token.value, platform }),
              });
            } catch {
              // Non-fatal: token still returned to caller so UI can reflect registration.
            }
          }

          resolve({ status: 'registered', token: token.value, platform });
        },
      );

      void PushNotifications.addListener('registrationError', () => {
        resolve({ status: 'unsupported' });
      });
    });
  }

  // ── Browser / PWA path (VAPID web push) ─────────────────────────────────
  const { registerPushServiceWorker } = await import('./sw-push-bridge');
  return registerPushServiceWorker(supabaseAccessToken);
}

type NavigateFn = (path: string) => void;

/**
 * Wire the native "notification tapped" → in-app navigation.
 *
 * When a courier taps an FCM/APNs notification, Capacitor fires
 * `pushNotificationActionPerformed`. The courier-push-dispatch Edge Function
 * sends `data: { orderId }` (FCM data values arrive as strings), so we route
 * to /dashboard/orders/<orderId>. A `route` override is also honoured if a
 * future payload carries an explicit absolute path.
 *
 * Browser / PWA: no-op (the service worker's notificationclick handles taps).
 * Returns a cleanup function; safe to call on web (returns a no-op).
 */
export function initPushTapListener(navigate: NavigateFn): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  let listenerHandle: { remove: () => void } | null = null;
  let cancelled = false;

  void (async () => {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const handle = await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action) => {
        const data = (action.notification?.data ?? {}) as Record<string, unknown>;
        const route = typeof data.route === 'string' ? data.route : null;
        const orderId = typeof data.orderId === 'string' ? data.orderId : null;
        const path = route ?? (orderId ? `/dashboard/orders/${orderId}` : null);
        if (path) navigate(path);
      },
    );
    if (cancelled) {
      handle.remove();
      return;
    }
    listenerHandle = handle;
  })();

  return () => {
    cancelled = true;
    listenerHandle?.remove();
  };
}
