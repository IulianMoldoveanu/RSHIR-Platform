// Lane Q (2026-05-04) — shared SEO helpers for the canonical/marketing host.
// Lane H ships the actual marketing pages (/, /features, /pricing, etc.);
// Lane I ships per-tenant social-commerce OG. This module is the contract
// the three lanes share so the sitemap stays in sync with the routes that
// actually exist.
//
// Tenant-scoped SEO continues to live in `seo.ts` + `(storefront)/page.tsx`.

import type { ResolvedTenant } from './tenant';

// Marketing pages exposed on the canonical host. Order = sitemap priority.
// Lane H must keep this list in sync with the actual page.tsx routes it
// ships. Adding a route without listing it here is a silent SEO miss.
export const MARKETING_ROUTES: ReadonlyArray<{
  path: string;
  // 1.0 = homepage, 0.8 = top-funnel, 0.6 = secondary, 0.4 = legal/contact
  priority: number;
}> = [
  { path: '/', priority: 1.0 },
  { path: '/features', priority: 0.8 },
  { path: '/pricing', priority: 0.8 },
  { path: '/migrate-from-gloriafood', priority: 0.9 },
  { path: '/case-studies/foisorul-a', priority: 0.6 },
  { path: '/affiliate', priority: 0.7 },
  { path: '/contact', priority: 0.4 },
  { path: '/privacy', priority: 0.3 },
];

export const PRIMARY_DOMAIN = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || '';

// Canonical host = the apex (no subdomain) on the configured primary domain,
// OR a Vercel auto-generated production URL. Used by sitemap.ts + robots.ts
// to decide whether to emit the marketing sitemap or the tenant sitemap.
export function isCanonicalHost(host: string): boolean {
  const h = host.toLowerCase();
  if (!h) return false;
  // Apex of the configured primary domain (e.g. `hiraisolutions.ro`).
  if (PRIMARY_DOMAIN && h === PRIMARY_DOMAIN) return true;
  // Vercel canonical production URL for the web app.
  if (h === 'hir-restaurant-web.vercel.app') return true;
  // Localhost root (no subdomain) for `pnpm dev` of the marketing site.
  if (h === 'localhost') return true;
  return false;
}

// Build absolute URL for a marketing path on the canonical host. Used by
// sitemap entries + JSON-LD `url` fields. Falls back to the configured
// primary domain when the request host isn't itself canonical (rare —
// happens on preview deployments hitting `/sitemap.xml`).
export function canonicalBaseUrl(currentHost: string): string {
  if (isCanonicalHost(currentHost)) {
    const proto = currentHost === 'localhost' ? 'http' : 'https';
    return `${proto}://${currentHost}`;
  }
  if (PRIMARY_DOMAIN) return `https://${PRIMARY_DOMAIN}`;
  return 'https://hir-restaurant-web.vercel.app';
}

// Build absolute URL for a tenant's primary host:
//   - custom_domain when set (verified status checked at lookup time)
//   - else `<slug>.<NEXT_PUBLIC_PRIMARY_DOMAIN>` when configured
//   - else fallback to `<slug>.lvh.me` for local dev
export function tenantCanonicalUrl(
  tenant: Pick<ResolvedTenant, 'slug' | 'custom_domain'>,
): string {
  if (tenant.custom_domain) return `https://${tenant.custom_domain}`;
  if (PRIMARY_DOMAIN) return `https://${tenant.slug}.${PRIMARY_DOMAIN}`;
  return `http://${tenant.slug}.lvh.me`;
}

// JSON-LD: HIR Organization. Used on `/` (Lane H homepage).
export function organizationJsonLd(baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'HIR Restaurant Suite',
    url: baseUrl,
    logo: `${baseUrl}/logo.svg`,
    sameAs: [
      'https://www.linkedin.com/company/hir-restaurant-suite',
      'https://www.facebook.com/hirrestaurantsuite',
    ],
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'sales',
        email: 'iulianm698@gmail.com',
        areaServed: 'RO',
        availableLanguage: ['ro', 'en'],
      },
    ],
  };
}

// JSON-LD: WebSite + SearchAction. Used on `/` (Lane H homepage).
export function websiteJsonLd(baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'HIR Restaurant Suite',
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

// JSON-LD: BreadcrumbList. Used on `/case-studies/*` (Lane H).
export function breadcrumbJsonLd(
  baseUrl: string,
  trail: ReadonlyArray<{ name: string; path: string }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: `${baseUrl}${item.path}`,
    })),
  };
}
