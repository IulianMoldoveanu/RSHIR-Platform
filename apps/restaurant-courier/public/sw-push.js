/**
 * Service worker for the courier PWA. Handles:
 *   - Web Push notifications (incoming order pings, click → focus tab)
 *   - Network-first cache fallback for /dashboard/orders/* navigation
 *     requests so a rider with an active order can still see it after
 *     a tab refresh while offline.
 *
 * Registered from src/lib/push/register-sw.ts.
 */

const PAGE_CACHE = 'hir-courier-pages-v2';
const OFFLINE_CACHE = 'hir-courier-offline-v1';
const OFFLINE_URL = '/offline';
const CACHEABLE_PATH_PREFIX = '/dashboard/orders';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Pre-cache the offline fallback so it survives the first network
      // outage. If the response fails (e.g. dev build without /offline),
      // we silently skip — the SW must still install successfully.
      try {
        const cache = await caches.open(OFFLINE_CACHE);
        await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      } catch {
        /* offline page optional */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop any older versioned caches.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              (name.startsWith('hir-courier-pages-') && name !== PAGE_CACHE) ||
              (name.startsWith('hir-courier-offline-') && name !== OFFLINE_CACHE),
          )
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode !== 'navigate') return;

  const isCacheableOrder =
    url.pathname.startsWith(CACHEABLE_PATH_PREFIX) &&
    url.pathname !== CACHEABLE_PATH_PREFIX &&
    url.pathname !== `${CACHEABLE_PATH_PREFIX}/`;

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request);
        if (fresh.ok && isCacheableOrder) {
          // Active-order pages are the only navigations we cache for
          // re-open. Keep the SW alive until the cache write completes;
          // otherwise mobile/backgrounded tabs can terminate the worker
          // right after respondWith resolves and silently drop the put.
          event.waitUntil(
            (async () => {
              const cache = await caches.open(PAGE_CACHE);
              await cache.put(request, fresh.clone()).catch(() => {});
            })(),
          );
        }
        return fresh;
      } catch (err) {
        // Offline path. Try the active-order cache first, then the
        // global offline fallback page. Re-throw only if neither hits.
        if (isCacheableOrder) {
          const cache = await caches.open(PAGE_CACHE);
          const cached = await cache.match(request);
          if (cached) return cached;
        }
        const offlineCache = await caches.open(OFFLINE_CACHE);
        const offline = await offlineCache.match(OFFLINE_URL);
        if (offline) return offline;
        throw err;
      }
    })(),
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'HIR Courier', body: event.data.text() };
  }

  const title = payload.title ?? 'HIR Courier';
  const options = {
    body: payload.body ?? 'Ai o nouă comandă disponibilă.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.orderId ?? 'hir-courier',
    data: {
      url: payload.orderId ? `/dashboard/orders/${payload.orderId}` : '/dashboard/orders',
    },
    // Riders work hands-busy on a bike or scooter; the visual notification
    // alone is too easy to miss. Vibration buzzes on Android (iOS Web Push
    // ignores it gracefully). renotify makes a same-tag follow-up still
    // alert the rider — important when a status changes mid-delivery.
    vibrate: [200, 80, 200, 80, 400],
    renotify: true,
    requireInteraction: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/dashboard/orders';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if open, else open new one.
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      }),
  );
});
