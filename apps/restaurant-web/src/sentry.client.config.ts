import * as Sentry from '@sentry/nextjs';

// Browser-runtime Sentry init. DSN must use the public env var so it ships
// in the client bundle. Session replay is hard-disabled (sample rate 0) —
// the storefront handles customer PII; enabling replay needs a deliberate
// scrub config first.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
});
