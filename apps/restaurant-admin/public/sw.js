// Minimal passthrough service worker.
// Caching is intentionally disabled: the admin is real-time data-heavy;
// stale cached state would confuse multi-tenant reads.
// The SW exists solely so Chrome/Android install criteria (HTTPS + manifest + SW) are met.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // Passthrough — let the browser handle every request normally.
});
