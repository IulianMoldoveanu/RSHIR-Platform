/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
