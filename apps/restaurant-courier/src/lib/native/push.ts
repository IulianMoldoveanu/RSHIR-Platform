'use client';

/**
 * Capacitor-aware push notification shim.
 *
 * In a native Capacitor shell (iOS/Android), web push (VAPID) is replaced
 * by native push channels:
 *   - iOS: APNs (Apple Push Notification Service)
 *   - Android: FCM (Firebase Cloud Messaging)
 *
 * The Capacitor PushNotifications plugin wraps both. This shim bridges the
 * existing web-push registration flow to native when the plugin is installed.
 *
 * Current state: browser-only path is active. Native path is commented out
 * and ready to enable once @capacitor/push-notifications is installed and
 * FCM google-services.json + APNs .p8 key are provisioned.
 *
 * ACTIVATION steps (see mobile/README.md):
 *   1. Install @capacitor/push-notifications.
 *   2. Add google-services.json to android/app/.
 *   3. Add APNs Auth Key to Xcode project (or use Capacitor config).
 *   4. Update the Supabase Edge Function `courier-push-dispatch` to send
 *      FCM/APNs payloads using the device token stored here.
 *   5. Uncomment the native path below.
 */

export type PushRegistrationResult =
  | { status: 'registered'; token: string; platform: 'ios' | 'android' }
  | { status: 'subscribed'; endpoint: string; platform: 'web' }
  | { status: 'denied' }
  | { status: 'unsupported' }
  | { status: 'not-configured' };

/** Returns true when running inside a Capacitor native shell. */
function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as Record<string, unknown>)['Capacitor'] as
    | { isNativePlatform?: () => boolean }
    | undefined;
  return cap?.isNativePlatform?.() ?? false;
}

/**
 * Register for push notifications.
 *
 * Native shell: gets an FCM/APNs device token via Capacitor plugin and
 * POSTs it to the server. (Commented out until plugin is installed.)
 *
 * Browser: delegates to the existing web-push subscribe flow in
 * src/lib/push/subscribe.ts (VAPID).
 */
export async function registerForPush(
  supabaseAccessToken: string,
): Promise<PushRegistrationResult> {
  // --- Native path (Capacitor PushNotifications plugin) ---
  // Uncomment once @capacitor/push-notifications is installed:
  //
  // if (isNativeShell()) {
  //   const { PushNotifications } = await import('@capacitor/push-notifications');
  //   const perm = await PushNotifications.requestPermissions();
  //   if (perm.receive !== 'granted') return { status: 'denied' };
  //   await PushNotifications.register();
  //   return new Promise((resolve) => {
  //     PushNotifications.addListener('registration', async (token) => {
  //       const platform = (window as any).Capacitor.getPlatform();
  //       const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  //       await fetch(`${supabaseUrl}/functions/v1/courier-push-register`, {
  //         method: 'POST',
  //         headers: { 'Content-Type': 'application/json',
  //                     Authorization: `Bearer ${supabaseAccessToken}` },
  //         body: JSON.stringify({ native_token: token.value, platform }),
  //       });
  //       resolve({ status: 'registered', token: token.value,
  //                 platform: platform === 'ios' ? 'ios' : 'android' });
  //     });
  //     PushNotifications.addListener('registrationError', () => {
  //       resolve({ status: 'unsupported' });
  //     });
  //   });
  // }

  // --- Browser path (web push / VAPID) ---
  const { registerPushServiceWorker } = await import('./sw-push-bridge');
  return registerPushServiceWorker(supabaseAccessToken);
}
