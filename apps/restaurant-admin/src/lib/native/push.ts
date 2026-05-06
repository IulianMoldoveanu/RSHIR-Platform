'use client';

/**
 * Capacitor-aware push notification shim for HIR Restaurant Admin.
 *
 * Restaurant owners and managers receive new-order push notifications:
 *   "Comanda nouă #1234 — acceptă acum"
 *   "Comanda #1234 necesita confirmare imediata"
 *
 * These are time-critical: the restaurant must accept within ~3 minutes
 * or the order auto-cancels. Native push (FCM/APNs) is more reliable
 * than web push for background delivery on Android and iOS.
 *
 * Current state: browser-only path is active. The native path is commented
 * out and ready to enable once @capacitor/push-notifications is installed.
 *
 * ACTIVATION steps (see mobile/README.md):
 *   1. Install @capacitor/push-notifications.
 *   2. Add google-services.json to android/app/.
 *   3. Add APNs Auth Key (.p8) to Xcode project.
 *   4. Update the Supabase Edge Function `admin-push-dispatch` to send
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
 * Native shell: gets an FCM/APNs device token via Capacitor plugin.
 * Browser: subscribes to web push (VAPID) via the existing /sw.js SW.
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
  //       await fetch(`${supabaseUrl}/functions/v1/admin-push-register`, {
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

  // --- Browser path (web push / VAPID via existing /sw.js) ---
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { status: 'unsupported' };
  }

  const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
  if (!VAPID_PUBLIC) return { status: 'not-configured' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { status: 'denied' };

  const reg = await navigator.serviceWorker.register('/sw.js');
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
    await fetch(`${supabaseUrl}/functions/v1/admin-push-subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAccessToken}`,
      },
      body: JSON.stringify(subscription.toJSON()),
    }).catch(() => {});
  }

  return { status: 'subscribed', endpoint, platform: 'web' };
}
