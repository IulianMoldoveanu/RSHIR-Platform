// Sentry in the browser, loaded off the critical path.
//
// Measured on production before this change: /login transferred 311 KB of
// JavaScript (995 KB unzipped, which is what the phone has to parse), and the
// single biggest item was the Sentry SDK at 119 KB transferred / 399 KB
// parsed — 38% of the page, on a screen that is an email field and a password
// field. A courier on mobile data in Bucharest waits for all of it before the
// app is interactive.
//
// Error reporting is worth keeping; blocking first paint for it is not. The
// SDK is imported dynamically, which moves it into its own async chunk, and
// the import is kicked off once the browser is idle. The login form becomes
// usable first, Sentry attaches a moment later.
//
// The trade: a crash in the first second or two of a cold load is not
// captured. That is a real loss, accepted deliberately — those are also the
// seconds a slow app loses the person entirely.
//
// This file replaces sentry.client.config.ts, which Sentry deprecates for
// Next 15 (it stops working under Turbopack).

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

function initSentry(): void {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn,
      release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
      // Light sampling on prod — the rider population is small and a
      // single bad shift could otherwise blow through the free-tier
      // event quota. Full sampling in dev/preview so we catch issues early.
      tracesSampleRate: (process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development') === 'production' ? 0.1 : 1.0,
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
      initialScope: {
        tags: { app: 'restaurant-courier', vertical: 'courier' },
      },
    });
  });
}

if (dsn && typeof window !== 'undefined') {
  // requestIdleCallback where it exists (Chrome/Android, which is what
  // couriers carry), a short timer on Safari/iOS which still lacks it. The
  // timeout bounds the wait so a permanently busy main thread cannot defer
  // error reporting forever.
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(initSentry, { timeout: 5000 });
  } else {
    window.setTimeout(initSentry, 2500);
  }
}
