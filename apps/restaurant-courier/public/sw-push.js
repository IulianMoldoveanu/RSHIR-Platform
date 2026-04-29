/**
 * Service worker for Web Push notifications.
 * Handles incoming push events and notification clicks.
 *
 * Registered from src/lib/push/register-sw.ts.
 */

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
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
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
