// Sentry edge-runtime init — used by middleware.ts and any edge route
// handler. Same env-var fallback as the server config so we never miss
// errors on the edge boundary.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
  });
}
