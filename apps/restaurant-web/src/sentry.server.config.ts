import * as Sentry from '@sentry/nextjs';

// Server-runtime Sentry init. DSN is read from env (set on Vercel for prod
// + preview); never hard-coded. Traces sample at 10% to keep volume bounded;
// errors capture at 100% by default. Session replay is intentionally OFF —
// the storefront handles customer PII (names / addresses / phone) and replay
// would need a deliberate PII-scrub config before we enable it.
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? 'development',
});
