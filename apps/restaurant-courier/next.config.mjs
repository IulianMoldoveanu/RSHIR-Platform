/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // BUILD_TIME is captured at compile time and exposed to /api/version so
  // smoke + uptime monitors can assert "the deploy I expected actually
  // went out". Vercel does not expose a system env var with the deploy
  // timestamp; build time is the closest stable proxy on serverless.
  env: { BUILD_TIME: new Date().toISOString() },
  transpilePackages: ['@hir/ui', '@hir/supabase-types'],
};

export default nextConfig;
