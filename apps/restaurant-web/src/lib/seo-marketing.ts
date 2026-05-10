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
  { path: '/alternativa-gloriafood-romania', priority: 0.9 },
  { path: '/case-studies/foisorul-a', priority: 0.6 },
  { path: '/parteneriat/inscriere', priority: 0.7 },
  { path: '/contact', priority: 0.4 },
  // Lane SITE-COPY-V2 (2026-05-10) — /press + /status removed from sitemap
  // (still resolve at their URLs but not indexed by crawlers).
  { path: '/privacy', priority: 0.3 },
];

// Lane BUG-HUNT-V1 (2026-05-10) — `hirforyou.ro` is the locked official
// brand domain (per 2026-05-09 PIVOT). When NEXT_PUBLIC_PRIMARY_DOMAIN
// isn't set on Vercel (currently the case in production for restaurant-web),
// canonical URLs were defaulting to `hir-restaurant-web.vercel.app` — a
// silent SEO disaster + dead `<slug>.lvh.me` tenant card links on
// /orase/<city>. Hardcoded brand fallback fixes both without requiring an
// env-var redeploy.
export const PRIMARY_DOMAIN =
  process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'hirforyou.ro';

// Canonical host = the apex (no subdomain) on the configured primary domain,
// OR a Vercel auto-generated production URL. Used by sitemap.ts + robots.ts
// to decide whether to emit the marketing sitemap or the tenant sitemap.
export function isCanonicalHost(host: string): boolean {
  const h = host.toLowerCase();
  if (!h) return false;
  // Apex of the configured primary domain (`hirforyou.ro`).
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
  return `https://${PRIMARY_DOMAIN}`;
}

// Build absolute URL for a tenant's primary host:
//   - custom_domain when set (verified status checked at lookup time)
//   - else `<slug>.<PRIMARY_DOMAIN>` (defaults to `hirforyou.ro` per the
//     hardcoded brand fallback above; previously fell back to `lvh.me`
//     which broke production tenant cards on /orase/<city>).
export function tenantCanonicalUrl(
  tenant: Pick<ResolvedTenant, 'slug' | 'custom_domain'>,
): string {
  if (tenant.custom_domain) return `https://${tenant.custom_domain}`;
  return `https://${tenant.slug}.${PRIMARY_DOMAIN}`;
}

// Lane SEO+ (2026-05-05) — build the absolute URL of the dynamic OG image
// for a marketing route. Returns `<canonical>/api/og?title=…&subtitle=…&variant=…`
// where `<canonical>` is the apex of PRIMARY_DOMAIN (or the Vercel canonical
// fallback) so social crawlers fetch it from a stable host even when the
// user lands on a preview deployment.
//
// Variants tune the visual style; all are rendered by the single
// `app/api/og/route.tsx` edge handler.
export function marketingOgImageUrl(input: {
  title: string;
  subtitle?: string;
  variant?: 'default' | 'pricing' | 'case-study' | 'partner' | 'migrate';
}): string {
  const base = `https://${PRIMARY_DOMAIN}`;
  const params = new URLSearchParams();
  params.set('title', input.title);
  if (input.subtitle) params.set('subtitle', input.subtitle);
  if (input.variant && input.variant !== 'default') params.set('variant', input.variant);
  return `${base}/api/og?${params.toString()}`;
}

// JSON-LD: HIRforYOU Organization. Used on `/` (Lane H homepage).
export function organizationJsonLd(baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'HIRforYOU',
    url: baseUrl,
    logo: `${baseUrl}/logo.svg`,
    sameAs: [
      'https://www.linkedin.com/company/hirforyou',
      'https://www.facebook.com/hirforyou',
    ],
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'sales',
        email: 'office@hirforyou.ro',
        telephone: '+40743700916',
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
    name: 'HIRforYOU',
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

// JSON-LD: LocalBusiness — Romania-focused SaaS provider, used on `/`
// and any page where local SERP intent (city + business type) matters.
// Per ChatGPT SEO audit 2026-05-10. We're a software vendor, not a
// brick-and-mortar restaurant, so address points to Brașov office.
export function localBusinessJsonLd(baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${baseUrl}/#localbusiness`,
    name: 'HIRforYOU',
    image: `${baseUrl}/logo.svg`,
    url: baseUrl,
    telephone: '+40743700916',
    email: 'office@hirforyou.ro',
    priceRange: '2 RON / comandă',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'RO',
      addressLocality: 'Brașov',
      addressRegion: 'BV',
    },
    areaServed: {
      '@type': 'Country',
      name: 'Romania',
    },
    sameAs: [
      'https://www.linkedin.com/company/hirforyou',
      'https://www.facebook.com/hirforyou',
    ],
  };
}

// JSON-LD: SoftwareApplication — surfaces HIR as a SaaS in Google's
// software-app rich result panels. Per ChatGPT SEO audit 2026-05-10.
export function softwareApplicationJsonLd(baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'HIRforYOU',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
    url: baseUrl,
    description:
      'Platformă românească de comenzi online pentru restaurante: site propriu, KDS, livrare, AI, fără comision procentual.',
    offers: {
      '@type': 'Offer',
      price: '2',
      priceCurrency: 'RON',
      description: '2 RON per comandă livrată — fără comision procentual',
    },
    publisher: {
      '@type': 'Organization',
      name: 'HIRforYOU',
      url: baseUrl,
    },
  };
}

// JSON-LD: FAQPage. Caller passes [{ q, a }] pairs; we wrap them in the
// Schema.org Question/Answer shape. Per ChatGPT SEO audit 2026-05-10 —
// surface FAQ rich results on `/`, `/pricing`, `/migrate-from-gloriafood`,
// and the new `/alternativa-gloriafood-romania`.
export function faqPageJsonLd(items: ReadonlyArray<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: it.answer,
      },
    })),
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
