import * as Sentry from '@sentry/nextjs';

// Browser-runtime Sentry init for the courier app. Replay disabled —
// courier UI shows real-time customer address + phone during dispatch.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
});
