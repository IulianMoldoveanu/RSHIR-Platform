import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { tenantBaseUrl } from '@/lib/tenant';
import { canonicalBaseUrl, isCanonicalHost } from '@/lib/seo-marketing';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const host =
    headers().get('x-hir-host') ??
    headers().get('host')?.split(':')[0] ??
    '';

  // On the marketing host, point crawlers at the canonical base; on tenant
  // hosts, point at the tenant host (its sitemap.xml lists tenant menu items).
  const baseUrl = isCanonicalHost(host) ? canonicalBaseUrl(host) : tenantBaseUrl();

  return {
    rules: [
      {
        userAgent: '*',
        // `/` covers all marketing pages on the canonical host AND the
        // storefront homepage on tenant hosts. `/m/`, `/bio` are
        // tenant-only; `/features`, `/pricing`, `/migrate-from-gloriafood`,
        // `/case-studies/`, `/parteneriat/inscriere`, `/contact` are
        // marketing-only.
        allow: [
          '/',
          '/m/',
          '/bio',
          '/privacy',
          '/features',
          '/pricing',
          '/migrate-from-gloriafood',
          '/case-studies/',
          '/parteneriat/inscriere',
          '/contact',
        ],
        // PII/transactional surfaces never get indexed.
        disallow: ['/api/', '/checkout', '/track', '/account'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
