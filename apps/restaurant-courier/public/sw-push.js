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

// ---------------------------------------------------------------------------
// Background Sync — drain the IndexedDB transition queue while backgrounded.
//
// Registered from transition-runner.ts after every enqueue. Chrome fires the
// sync event when the network returns, even with the tab closed. iOS Safari
// does not support Background Sync — the page-context drainer in
// TransitionSync is the fallback for those clients.
//
// IDB schema mirrors transition-queue.ts exactly:
//   DB:    'hir.courier.transition-queue'  version 1
//   Store: 'pending'   keyPath 'id' autoIncrement
//   Shape: { id, kind, orderId, payload, attempts, createdAt }
// ---------------------------------------------------------------------------

const TRANSITION_DB_NAME = 'hir.courier.transition-queue';
const TRANSITION_DB_VERSION = 1;
const TRANSITION_STORE = 'pending';
const TRANSITION_DRAIN_TAG = 'transition-queue-drain';
const TRANSITION_DRAIN_URL = '/api/courier/transitions/drain';
const TRANSITION_MAX_ATTEMPTS = 8;

function openTransitionDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(TRANSITION_DB_NAME, TRANSITION_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TRANSITION_STORE)) {
        db.createObjectStore(TRANSITION_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
  });
}

function listTransitionsPending(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRANSITION_STORE, 'readonly');
    const store = tx.objectStore(TRANSITION_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error ?? new Error('IDB getAll failed'));
  });
}

function deleteTransitionItem(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRANSITION_STORE, 'readwrite');
    const store = tx.objectStore(TRANSITION_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('IDB delete failed'));
  });
}

function bumpTransitionItem(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRANSITION_STORE, 'readwrite');
    const store = tx.objectStore(TRANSITION_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result;
      if (!item) return resolve();
      item.attempts = (item.attempts ?? 0) + 1;
      const putReq = store.put(item);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error ?? new Error('IDB put failed'));
    };
    getReq.onerror = () => reject(getReq.error ?? new Error('IDB get failed'));
  });
}

async function drainTransitionQueue() {
  let db;
  try {
    db = await openTransitionDb();
  } catch {
    // IDB unavailable — nothing to drain.
    return;
  }

  let items;
  try {
    items = await listTransitionsPending(db);
  } catch {
    return;
  }

  for (const item of items) {
    if (item.id == null) continue;

    if ((item.attempts ?? 0) >= TRANSITION_MAX_ATTEMPTS) {
      // Drop permanently-failing items. The server-side status filter no-ops
      // on stale transitions, so dropping here is safe (no data loss).
      await deleteTransitionItem(db, item.id).catch(() => {});
      continue;
    }

    try {
      // The SW runs same-origin, so cookies (Supabase session) are sent
      // automatically — the route validates the session server-side.
      const res = await fetch(TRANSITION_DRAIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          kind: item.kind,
          orderId: item.orderId,
          payload: item.payload ?? {},
        }),
        credentials: 'include',
      });

      if (res.ok) {
        await deleteTransitionItem(db, item.id).catch(() => {});
      } else if (res.status >= 400 && res.status < 500) {
        // 4xx — client error (bad shape, auth missing). Bump attempts; will
        // eventually be dropped after MAX_ATTEMPTS. Do not re-register sync
        // for 4xx because re-trying immediately will just 4xx again.
        await bumpTransitionItem(db, item.id).catch(() => {});
      } else {
        // 5xx or network error — bump and let the browser retry the sync tag.
        await bumpTransitionItem(db, item.id).catch(() => {});
      }
    } catch {
      // fetch itself threw (network down again mid-drain). bump and bail;
      // the browser will re-fire the sync event when connectivity returns.
      await bumpTransitionItem(db, item.id).catch(() => {});
    }
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag !== TRANSITION_DRAIN_TAG) return;
  // waitUntil keeps the SW alive until the drain completes. Errors inside
  // drainTransitionQueue are swallowed there; we wrap in a catch here as an
  // extra guarantee so a thrown exception never fails the notification pipeline.
  event.waitUntil(drainTransitionQueue().catch(() => {}));
});
