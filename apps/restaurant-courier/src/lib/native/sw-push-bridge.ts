'use client';

/**
 * Thin bridge from the native push shim to the existing web-push flow.
 * Separated so the Capacitor push.ts does not import push/subscribe.ts
 * directly — that avoids circular reference risk and keeps each file
 * focused.
 */

import type { PushRegistrationResult } from './push';

export async function registerPushServiceWorker(
  supabaseAccessToken: string,
): Promise<PushRegistrationResult> {
  const { registerPushServiceWorker: register } = await import('../push/register-sw');
  const { subscribeToPush } = await import('../push/subscribe');

  const registration = await register();
  if (!registration) return { status: 'denied' };

  const ok = await subscribeToPush(registration, supabaseAccessToken);
  if (!ok) return { status: 'not-configured' };

  const sub = await registration.pushManager.getSubscription();
  return sub
    ? { status: 'subscribed', endpoint: sub.endpoint, platform: 'web' }
    : { status: 'unsupported' };
}
