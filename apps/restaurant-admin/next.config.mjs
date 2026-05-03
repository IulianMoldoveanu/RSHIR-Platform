/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@hir/ui', '@hir/supabase-types', '@hir/integration-core'],
  experimental: {
    // 52+ files import from lucide-react across web + admin. Without this
    // flag Next bundles the full barrel; with it Next emits per-icon
    // imports and shaves measurable JS from cold loads.
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
