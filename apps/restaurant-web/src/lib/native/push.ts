'use client';

/**
 * Capacitor-aware push notification shim for HIR Storefront.
 *
 * Customers receive order-status push notifications:
 *   "Comanda ta a fost acceptată"
 *   "Curierul tău este în drum"
 *   "Comanda a ajuns!"
 *
 * In a native Capacitor shell (iOS/Android), web push (VAPID) is replaced
 * by native push channels:
 *   - iOS: APNs (Apple Push Notification Service)
 *   - Android: FCM (Firebase Cloud Messaging)
 *
 * Current state: browser-only path is active. The native path is commented
 * out and ready to enable once @capacitor/push-notifications is installed
 * and FCM google-services.json + APNs .p8 key are provisioned.
 *
 * ACTIVATION steps (see mobile/README.md):
 *   1. Install @capacitor/push-notifications.
 *   2. Add google-services.json to android/app/.
 *   3. Add APNs Auth Key (.p8) to Xcode project.
 *   4. Update the Supabase Edge Function `order-push-dispatch` to send
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
  const cap = (window as Record<string, unknown>)['Capacitor'] as
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
 * Browser: subscribes to the VAPID web push channel using the existing
 * service worker at /service-worker.js. The VAPID public key is read
 * from NEXT_PUBLIC_VAPID_PUBLIC_KEY.
 */
export async function registerForPush(
  /** Supabase access token for authenticated device registration. */
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
  //       await fetch(`${supabaseUrl}/functions/v1/storefront-push-register`, {
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
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { status: 'unsupported' };
  }

  const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
  if (!VAPID_PUBLIC) return { status: 'not-configured' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { status: 'denied' };

  const reg = await navigator.serviceWorker.register('/service-worker.js');
  await navigator.serviceWorker.ready;

  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
  });

  const endpoint = subscription.endpoint;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    await fetch(`${supabaseUrl}/functions/v1/storefront-push-subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAccessToken}`,
      },
      body: JSON.stringify(subscription.toJSON()),
    }).catch(() => {
      // Registration failure is non-fatal — user still gets in-app notifications.
    });
  }

  return { status: 'subscribed', endpoint, platform: 'web' };
}
