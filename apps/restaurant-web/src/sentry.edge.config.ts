import * as Sentry from '@sentry/nextjs';

// Edge-runtime Sentry init (middleware + edge API routes). Reads same DSN
// from env. Sample rate matches the server config so traces correlate
// cleanly when a request crosses runtimes.
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? 'development',
});
