// Sentry server init — runs on Vercel server functions + Next.js
// app-router server components for the courier app.
//
// DSN comes from SENTRY_DSN (NOT NEXT_PUBLIC_*) so the server token
// never leaks into the client bundle. Both env vars are already wired
// into Vercel per reference_secrets_vault.md.

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
