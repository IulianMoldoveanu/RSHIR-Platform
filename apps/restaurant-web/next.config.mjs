/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // BUILD_TIME is captured at compile time and exposed to /api/version so
  // smoke + uptime monitors can assert "the deploy I expected actually
  // went out". Vercel does not expose a system env var with the deploy
  // timestamp; build time is the closest stable proxy on serverless.
  env: { BUILD_TIME: new Date().toISOString() },
  // @hir/supabase-types ships raw .ts in package.json `exports` (./src/*.ts)
  // and the web app imports runtime helpers from it (createServerSupabase
  // in src/lib/supabase.ts, createBrowserSupabase in src/lib/realtime/
  // supabase-browser.ts). Excluding it from transpilation breaks `next build`
  // and runtime module parsing.
  transpilePackages: ['@hir/ui', '@hir/supabase-types', '@hir/integration-core'],
  experimental: {
    // 52+ files import from lucide-react across web + admin. Without this
    // flag Next bundles the full barrel; with it Next emits per-icon
    // imports and shaves measurable JS from cold loads.
    //
    // Lane M (perf pass 2026-05-04): added framer-motion + date-fns +
    // @hir/ui. framer-motion is on the storefront landing critical path
    // (menu-list, menu-item-card, category-tabs, cart-drawer, locale-
    // switcher). Next 14's transformer rewrites `import { motion } from
    // 'framer-motion'` to a deep import that strips the unused half of
    // the library — measurable LCP/TBT improvement on slow connections.
    optimizePackageImports: ['lucide-react', 'framer-motion', 'date-fns', '@hir/ui'],
  },
  // Security headers — added 2026-05-10 per overnight audit P1. CSP deferred
  // until we inventory all 3rd-party origins (Stripe/Vercel/Sentry/Supabase/
  // Resend); these 4 close clickjacking + MIME sniff + referer leak +
  // permission policy gaps without that inventory.
  // SAMEORIGIN (not DENY) on storefront because the embed widget renders
  // under ?embed=1 in iframes on merchant sites — DENY would break the
  // widget product.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },
          // HSTS with includeSubDomains + preload so hirforyou.ro qualifies
          // for the HSTS preload list (https://hstspreload.org). Vercel's
          // edge auto-adds these flags on *.vercel.app but NOT on custom
          // domains — explicit set here closes the gap. 2y max-age matches
          // Vercel's own posture; both subdomain + preload are required
          // for browser preload list eligibility.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
