// Next.js 15 instrumentation hook. Next loads this file once per runtime
// (nodejs / edge) and invokes `register()` before any request is served.
// We use it to initialise Sentry on the server + edge runtimes; the
// client-side init lives in `sentry.client.config.ts` and is loaded by
// Next automatically when present in `src/`.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Next 15 expects the hook to be named `onRequestError`; Sentry exports it
// as `captureRequestError`, so we re-export under the Next-required name.
export { captureRequestError as onRequestError } from '@sentry/nextjs';
