import * as Sentry from '@sentry/nextjs';

// Server-runtime Sentry init for the courier app. Courier surface gets
// hammered by GPS pings + status updates; 10% trace sample keeps volume
// bounded. Session replay is OFF — courier flows expose customer address +
// phone in real time.
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? 'development',
});
