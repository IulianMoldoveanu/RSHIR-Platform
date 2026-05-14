// Next.js 15 instrumentation hook for Sentry.
//
// Next loads this file once at boot for each runtime (node + edge) and
// runs `register()` to wire instrumentation. Routing the load through a
// dynamic import keeps the Sentry config out of the request hot path
// when DSN is missing in local dev — no init runs, no overhead.
//
// onRequestError is invoked by Next 15 for every server-component or
// route-handler error. Forwarding to Sentry.captureRequestError gives
// us proper request context (path, method, headers) without manual
// breadcrumbs.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
