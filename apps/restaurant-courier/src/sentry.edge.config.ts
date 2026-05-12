import * as Sentry from '@sentry/nextjs';

// Edge-runtime Sentry init (middleware + edge routes) for the courier app.
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? 'development',
});
