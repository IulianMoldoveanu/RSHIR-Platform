// HIR Restaurant Web — Service Worker
// Handles Web Push notifications for the customer order-tracking page.
// Also registers a fetch handler (required for PWA installability in some
// browsers). No caching strategy yet — pass-through only.

// Minimal fetch pass-through. Browsers require at least one fetch handler for
// the service worker to count toward installability criteria.
self.addEventListener('fetch', (_event) => {
  // Pass-through: no offline cache yet. Real caching strategy is roadmap item.
  return;
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'HIR', body: event.data.text() };
  }

  const title = payload.title ?? 'HIR Restaurant';
  const options = {
    body: payload.body ?? '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.orderId ? `order-${payload.orderId}` : 'hir-order',
    renotify: true,
    data: payload,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const orderId = event.notification.data?.orderId;
  const token = event.notification.data?.token;
  const url = token ? `/track/${token}` : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('/track/') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
