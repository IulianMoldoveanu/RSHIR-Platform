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

export default nextConfig;
