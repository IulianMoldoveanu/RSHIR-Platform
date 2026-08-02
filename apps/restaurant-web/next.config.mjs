/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework + version in every response. Free removal
  // of a fingerprinting signal an attacker would otherwise get for nothing.
  poweredByHeader: false,
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
  // Security headers — added 2026-05-10 per overnight audit P1.
  //
  // 2026-08-02: X-Frame-Options moved OUT of here and into middleware.ts.
  // The value has to depend on whether the request is in embed mode, which
  // survives navigation via the `hir_embed` cookie — something a static
  // config rule can't see. See the long note in middleware.ts: the
  // SAMEORIGIN that used to live here was breaking the embed widget on every
  // merchant site, which the old comment here explicitly (and wrongly)
  // believed it avoided. Middleware also emits the CSP.
  // Per Iulian directive 2026-06-02: only ONE dedicated GloriaFood page on
  // the marketing site (/migrate-from-gloriafood). The /alternativa-gloriafood-romania
  // SEO landing is redirected 301 to consolidate signal + traffic into the
  // single canonical destination.
  //
  // Per Iulian directive 2026-08-01: the marketing site is repositioned as a
  // pure "here's how it works" showcase, not a sales/conversion funnel —
  // /pricing (subscription pitch, ROI calculator, phone-number lead capture)
  // no longer fits that job and is retired outright, 301'd to the homepage
  // so any bookmark/indexed link/shared URL still resolves to something
  // real instead of a dead 404.
  async redirects() {
    return [
      {
        source: '/alternativa-gloriafood-romania',
        destination: '/migrate-from-gloriafood',
        permanent: true,
      },
      {
        source: '/pricing',
        destination: '/',
        permanent: true,
      },
      // Per Iulian directive 2026-08-01 (same day, later): /features — a wall
      // of feature cards — is replaced by /cum-functioneaza, a walkthrough
      // built from real app screenshots ("putin scris ... multe poze
      // relevante"). 301 rather than delete so the page's existing search
      // signal and any inbound links land on its replacement.
      {
        source: '/features',
        destination: '/cum-functioneaza',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
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
