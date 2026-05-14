// Sentry client init — runs in every browser that loads the courier app.
//
// DSN comes from NEXT_PUBLIC_SENTRY_DSN, already wired into Vercel for
// the rshir-courier project (see reference_secrets_vault.md). Without
// the env var present the SDK becomes a no-op silently, so local dev
// without secrets is unaffected.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Light sampling on prod — the rider population is small and a
    // single bad shift could otherwise blow through the free-tier
    // event quota. Raise after we calibrate baseline volume.
    tracesSampleRate: 0.1,
    // Sessions replay disabled by default — replay carries PII (proof
    // photos, customer name, address) that we don't want shipped to a
    // third party without an explicit DPA review. Re-enable per
    // ticket when DPA work is complete.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Strip default PII that the SDK would attach automatically.
    // The order detail page reads customer_first_name + dropoff_line1;
    // we never want those in a Sentry breadcrumb.
    sendDefaultPii: false,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
  });
}
