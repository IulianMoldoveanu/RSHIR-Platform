import { withSentryConfig } from '@sentry/nextjs';
import withBundleAnalyzer from '@next/bundle-analyzer';

const bundleAnalyzer = withBundleAnalyzer({
  // Opt-in: set ANALYZE=true to emit the report. Default off so CI and
  // local dev runs stay fast.
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // BUILD_TIME is captured at compile time and exposed to /api/version so
  // smoke + uptime monitors can assert "the deploy I expected actually
  // went out". Vercel does not expose a system env var with the deploy
  // timestamp; build time is the closest stable proxy on serverless.
  env: { BUILD_TIME: new Date().toISOString() },
  transpilePackages: ['@hir/ui', '@hir/supabase-types'],
  experimental: {
    // Lane M (perf pass 2026-05-04): match restaurant-web's setup. Courier
    // is mobile-first, runs over 3G/4G, and benefits the most from a
    // smaller initial JS bundle. framer-motion + lucide-react + @hir/ui
    // are all in the courier critical path.
    optimizePackageImports: ['lucide-react', 'framer-motion', '@hir/ui'],
  },
  // Security headers — added 2026-05-10 per overnight audit P1.
  // Courier needs geolocation (live tracking) + microphone (voice notes
  // future). DENY framing — courier authenticated session must not be
  // embeddable.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(self)' },
        ],
      },
    ];
  },
};

// Wrap with Sentry only when env hints at upload + DSN are present.
// Source-map upload + project resolution rely on SENTRY_AUTH_TOKEN +
// SENTRY_ORG + SENTRY_PROJECT — without them we still want Sentry SDK
// loaded at runtime (errors reported via DSN) but skip the build-time
// upload phase to avoid noisy CI warnings on PR previews.
const sentryWebpackOptions = {
  // SENTRY_ORG/PROJECT are picked up from env by withSentryConfig when
  // SENTRY_AUTH_TOKEN is set. We pass `silent` and `disableLogger` so
  // builds without the upload token stay quiet.
  silent: !process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  disableLogger: true,
  // The default tunnel route hides /sentry-* requests from ad-blockers.
  // We keep it on so client error reporting stays alive even for users
  // with aggressive privacy extensions.
  tunnelRoute: '/monitoring',
};

export default withSentryConfig(bundleAnalyzer(nextConfig), sentryWebpackOptions);
