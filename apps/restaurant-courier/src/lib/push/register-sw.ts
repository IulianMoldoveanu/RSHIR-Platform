'use client';

/**
 * Registers the push service worker and requests Notification permission.
 *
 * Call this once from a client component that mounts after login
 * (e.g. the dashboard layout). Safe to call multiple times — SW registration
 * is idempotent.
 *
 * Returns the ServiceWorkerRegistration on success, null if push is not
 * supported or permission is denied.
 */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  // Request notification permission.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  try {
    const registration = await navigator.serviceWorker.register('/sw-push.js', {
      scope: '/',
    });
    return registration;
  } catch (err) {
    console.error('[push] SW registration failed', err);
    return null;
  }
}
