/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@hir/ui', '@hir/supabase-types'],
};

export default nextConfig;
