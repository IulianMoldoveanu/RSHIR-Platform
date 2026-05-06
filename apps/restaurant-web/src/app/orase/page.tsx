// Lane STOREFRONT-CITY-LANDING (2026-05-06) — `/orase` index page.
//
// Lists every active city HIR covers with a per-city tenant count. Acts as
// hub for SEO crawlers (one URL → 12 city URLs from the sitemap) and as a
// "you are not in a serviced city yet" entry point for direct visitors.
//
// Server-rendered with ISR — the city + count data changes when admins
// onboard/deactivate tenants, but daily granularity is plenty.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, MapPin } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { getLocale } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import { safeJsonLd } from '@/lib/jsonld';
import {
  canonicalBaseUrl,
  breadcrumbJsonLd,
  marketingOgImageUrl,
} from '@/lib/seo-marketing';
import { headers } from 'next/headers';
import { listActiveCities, countActiveTenantsForCity, type CityRow } from '@/lib/cities';

export const runtime = 'nodejs';
// Revalidate hourly — counts shift slowly; admins don't expect new tenants
// to appear instantly on the public listing.
export const revalidate = 3600;

const PRIMARY_DOMAIN = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || '';
const CANONICAL_BASE = PRIMARY_DOMAIN
  ? `https://${PRIMARY_DOMAIN}`
  : 'https://hir-restaurant-web.vercel.app';
const PAGE_URL = `${CANONICAL_BASE}/orase`;

export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  const title = t(locale, 'marketing.cities.index_page_title');
  const description = t(locale, 'marketing.cities.index_page_description');
  const og = marketingOgImageUrl({
    title,
    subtitle: description,
    variant: 'default',
  });
  return {
    title,
    description,
    alternates: {
      canonical: PAGE_URL,
      languages: { 'ro-RO': PAGE_URL, en: PAGE_URL, 'x-default': PAGE_URL },
    },
    openGraph: {
      title,
      description,
      url: PAGE_URL,
      type: 'website',
      locale: locale === 'en' ? 'en_GB' : 'ro_RO',
      images: [{ url: og, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [og] },
    robots: { index: true, follow: true },
  };
}

type CityWithCount = CityRow & { tenantCount: number };

async function loadCitiesWithCounts(): Promise<CityWithCount[]> {
  const cities = await listActiveCities();
  // Sequential is fine — 12 cities, queries are head:true count-only,
  // each ~10ms. Parallel via Promise.all is also fine and faster on cold.
  const counts = await Promise.all(cities.map((c) => countActiveTenantsForCity(c)));
  return cities.map((c, i) => ({ ...c, tenantCount: counts[i] ?? 0 }));
}

export default async function OraseIndexPage() {
  const currentLocale = getLocale();
  const cities = await loadCitiesWithCounts();
  const totalCount = cities.length;

  // Suppress the canonicalBaseUrl-from-host trick — the index is reachable
  // from any canonical alias, but breadcrumb URLs always point at the
  // configured PRIMARY_DOMAIN so social previews are stable.
  const host =
    headers().get('x-hir-host') ?? headers().get('host')?.split(':')[0] ?? '';
  const baseUrl = canonicalBaseUrl(host);

  const breadcrumb = breadcrumbJsonLd(baseUrl, [
    { name: t(currentLocale, 'marketing.cities.index_breadcrumb_home'), path: '/' },
    { name: t(currentLocale, 'marketing.cities.index_breadcrumb_self'), path: '/orase' },
  ]);

  return (
    <main
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumb) }}
      />
      <MarketingHeader currentLocale={currentLocale} />

      {/* Hero */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-20">
          <div className="mb-3 inline-flex items-center rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            {t(currentLocale, 'marketing.cities.index_hero_eyebrow')}
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
            {t(currentLocale, 'marketing.cities.index_hero_title')}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#475569]">
            {t(currentLocale, 'marketing.cities.index_hero_subtitle', { count: totalCount })}
          </p>
        </div>
      </section>

      {/* City grid */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((city) => (
            <li key={city.id}>
              <Link
                href={`/orase/${city.slug}`}
                className="group flex h-full flex-col justify-between rounded-2xl border border-[#E2E8F0] bg-white p-5 transition-colors hover:border-[#C7D2FE] hover:bg-[#F8FAFC]"
              >
                <div>
                  <div className="flex items-center gap-2 text-[#4F46E5]">
                    <MapPin className="h-4 w-4" />
                    <span className="text-xs font-medium uppercase tracking-wider">
                      {city.county ?? 'România'}
                    </span>
                  </div>
                  <h2 className="mt-3 text-xl font-semibold tracking-tight text-[#0F172A]">
                    {city.name}
                  </h2>
                  <p className="mt-2 text-sm text-[#475569]">
                    {city.tenantCount === 0
                      ? t(currentLocale, 'marketing.cities.index_card_count_zero')
                      : city.tenantCount === 1
                        ? t(currentLocale, 'marketing.cities.index_card_count_one', { count: city.tenantCount })
                        : t(currentLocale, 'marketing.cities.index_card_count_other', { count: city.tenantCount })}
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-[#4F46E5] group-hover:gap-2 transition-all">
                  {t(currentLocale, 'marketing.cities.index_card_cta')}
                  <ArrowRight className="h-4 w-4" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <MarketingFooter currentLocale={currentLocale} />
    </main>
  );
}
