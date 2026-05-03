/**
 * Service worker for the courier PWA. Handles:
 *   - Web Push notifications (incoming order pings, click → focus tab)
 *   - Network-first cache fallback for /dashboard/orders/* navigation
 *     requests so a rider with an active order can still see it after
 *     a tab refresh while offline.
 *
 * Registered from src/lib/push/register-sw.ts.
 */

const PAGE_CACHE = 'hir-courier-pages-v1';
const CACHEABLE_PATH_PREFIX = '/dashboard/orders';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop any older versioned caches.
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith('hir-courier-pages-') && name !== PAGE_CACHE).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // Only intercept navigations to active-order pages — full HTML
  // documents the rider may want to re-open after a refresh while
  // offline. We do NOT cache the orders list itself (data changes
  // too fast) or any data fetches.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode !== 'navigate') return;
  if (!url.pathname.startsWith(CACHEABLE_PATH_PREFIX)) return;
  if (url.pathname === CACHEABLE_PATH_PREFIX || url.pathname === `${CACHEABLE_PATH_PREFIX}/`) return;

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request);
        if (fresh.ok) {
          const cache = await caches.open(PAGE_CACHE);
          // Clone before consumers read the body.
          cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch (err) {
        const cache = await caches.open(PAGE_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
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
