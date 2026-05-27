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
