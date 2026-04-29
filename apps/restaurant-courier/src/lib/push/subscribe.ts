'use client';

/**
 * Gets (or creates) a PushSubscription for the current SW registration,
 * then POSTs it to the `courier-push-register` Edge Function so it is
 * stored in `courier_push_subscriptions`.
 *
 * VAPID public key is read from NEXT_PUBLIC_VAPID_PUBLIC_KEY env var.
 * Generate a VAPID key pair once per environment:
 *
 *   npx web-push generate-vapid-keys
 *
 * Store VAPID_PRIVATE_KEY as a secret in Supabase / Edge Function env.
 * Store VAPID_PUBLIC_KEY as NEXT_PUBLIC_VAPID_PUBLIC_KEY in .env.local.
 */
export async function subscribeToPush(
  registration: ServiceWorkerRegistration,
  supabaseAccessToken: string,
): Promise<boolean> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.warn('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set — skipping push subscription');
    return false;
  }

  let subscription: PushSubscription;
  try {
    // Reuse existing subscription if already registered.
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      subscription = existing;
    } else {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      });
    }
  } catch (err) {
    console.error('[push] PushManager.subscribe failed', err);
    return false;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/courier-push-register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAccessToken}`,
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    return res.ok;
  } catch (err) {
    console.error('[push] Failed to register subscription with server', err);
    return false;
  }
}

/** Convert a base64url VAPID key to Uint8Array for the browser PushManager API. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}
