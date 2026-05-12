import * as Sentry from '@sentry/nextjs';

// Server-runtime Sentry init for the admin app. The admin surface handles
// operator-level data (audit logs, tenant management); we still cap traces
// at 10% to bound spend. Session replay is OFF — admin pages can render
// PII for support flows and replay would need a scrub config first.
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? 'development',
});
