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
/**
 * Registers the same service worker WITHOUT asking for notification
 * permission.
 *
 * `registerPushServiceWorker` below only registers once the courier has said
 * yes to notifications, which meant a courier who declined — or who merely
 * closed the banner — ran with no service worker at all: no offline shell, and
 * nothing for the browser to treat as an installable app. The worker's
 * `fetch`, `sync` and `push` handlers all live in the same file, so
 * registering it early costs nothing and the push flow still owns the
 * permission prompt.
 *
 * Idempotent: the browser returns the existing registration when the worker is
 * already installed.
 */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator)) return null;

  try {
    return await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });
  } catch (err) {
    console.error('[pwa] SW registration failed', err);
    return null;
  }
}

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
