// Lane HIRforYOU-MARKETPLACE (2026-05-28) — /restaurante/[oras] city page.
//
// Static-by-default per-city listing. Mirrors /orase/[citySlug] structure
// but filters from the marketplace_directory materialized view so only
// opted-in tenants surface.
//
// `generateStaticParams` enumerates marketplace cities so each city ships
// as ISR at build. `dynamicParams = true` lets new cities be rendered on
// first request after onboarding.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, Star } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { EmptyState } from '@/components/storefront/empty-state';
import { getLocale } from '@/lib/i18n/server';
import { safeJsonLd } from '@/lib/jsonld';
import {
  canonicalBaseUrl,
  breadcrumbJsonLd,
  marketingOgImageUrl,
} from '@/lib/seo-marketing';
import { headers } from 'next/headers';
import { getCityBySlug, listActiveCities } from '@/lib/cities';
import {
  listDirectory,
  listMarketplaceCities,
  type DirectoryRow,
} from '@/lib/marketplace/directory';

export const runtime = 'nodejs';
export const revalidate = 1800; // 30-min ISR — counts shift slowly.
export const dynamicParams = true;

const PRIMARY_DOMAIN = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || '';
const CANONICAL_BASE = PRIMARY_DOMAIN
  ? `https://${PRIMARY_DOMAIN}`
  : 'https://hir-restaurant-web.vercel.app';

type Params = { params: Promise<{ oras: string }> };

export async function generateStaticParams() {
  // Marketplace cities = cities that already have at least one public
  // marketplace tenant. Cities without any opt-in tenant render dynamically
  // via dynamicParams so a single onboard immediately lights up its URL.
  const cities = await listMarketplaceCities();
  if (cities.length > 0) {
    return cities.map((c) => ({ oras: c.slug }));
  }
  // Fallback before the first marketplace tenant — pre-render the canonical
  // city list so SEO has something even when zero tenants opted in yet.
  const fallback = await listActiveCities();
  return fallback.map((c) => ({ oras: c.slug }));
}

export async function generateMetadata(props: Params): Promise<Metadata> {
  const { oras } = await props.params;
  const city = await getCityBySlug(oras);
  if (!city) return { robots: { index: false, follow: false } };

  const title = `Restaurante din ${city.name} — HIR Marketplace`;
  const description = `Comandă din restaurantele HIR din ${city.name}. Livrare rapidă, fără comisioane Glovo, prețul afișat = prețul plătit.`;
  const url = `${CANONICAL_BASE}/restaurante/${city.slug}`;
  const og = marketingOgImageUrl({
    title: `Restaurante ${city.name}`,
    subtitle: description,
    variant: 'default',
  });
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, 'x-default': url },
    },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      locale: 'ro_RO',
      images: [{ url: og, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [og] },
    robots: { index: true, follow: true },
  };
}

export default async function MarketplaceCityPage(props: Params) {
  const { oras } = await props.params;
  const currentLocale = getLocale();
  const city = await getCityBySlug(oras);
  if (!city) notFound();

  const rows = await listDirectory({ citySlug: city.slug, limit: 60 });

  const host =
    (await headers()).get('x-hir-host') ?? (await headers()).get('host')?.split(':')[0] ?? '';
  const baseUrl = canonicalBaseUrl(host);
  const breadcrumb = breadcrumbJsonLd(baseUrl, [
    { name: 'Acasă', path: '/' },
    { name: 'Restaurante', path: '/restaurante' },
    { name: city.name, path: `/restaurante/${city.slug}` },
  ]);

  return (
    <main
      id="main-content"
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
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            <MapPin className="h-3.5 w-3.5" />
            {city.county ?? 'România'}
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
            Restaurante din {city.name}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#475569]">
            {rows.length === 0
              ? `Adăugăm restaurante noi în ${city.name} săptămânal. Lasă-ne adresa de email mai jos și te anunțăm.`
              : `${rows.length} restaurante locale. Plătești prețul de pe meniu, nu 30% comision Glovo.`}
          </p>
        </div>
      </section>

      {/* Tenant grid OR empty state */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        {rows.length === 0 ? (
          <EmptyState
            icon={<MapPin className="h-7 w-7 text-purple-700" />}
            title={`Niciun restaurant HIR public în ${city.name} încă`}
            description="Lucrăm la onboarding cu restaurantele locale. Revenim săptămânal cu opțiuni noi."
            action={{ label: 'Vezi toate restaurantele', href: '/restaurante' }}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => (
              <CityCard key={row.tenant_id} row={row} citySlug={city.slug} />
            ))}
          </ul>
        )}
      </section>

      <MarketingFooter currentLocale={currentLocale} />
    </main>
  );
}

function CityCard({ row, citySlug }: { row: DirectoryRow; citySlug: string }) {
  const detailHref = `/restaurante/${citySlug}/${row.slug}`;
  return (
    <li>
      <Link
        href={detailHref}
        className="group flex h-full flex-col rounded-2xl border border-[#E2E8F0] bg-white p-5 transition-colors hover:border-[#C7D2FE] hover:bg-[#F8FAFC]"
      >
        <div className="flex items-start gap-4">
          {row.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.logo_url}
              alt=""
              loading="lazy"
              className="h-14 w-14 flex-none rounded-xl object-cover ring-1 ring-[#E2E8F0]"
            />
          ) : (
            <div
              className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-[#4F46E5] text-base font-semibold text-white"
              aria-hidden="true"
            >
              {row.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold tracking-tight text-[#0F172A]">
              {row.name}
            </h2>
            {row.tagline ? (
              <p className="mt-1 line-clamp-2 text-xs text-[#64748B]">{row.tagline}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 text-xs">
          {row.review_count > 0 ? (
            <span className="inline-flex items-center gap-1 font-medium text-[#0F172A]">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {row.avg_rating.toFixed(1)}
              <span className="text-[#64748B]">({row.review_count})</span>
            </span>
          ) : (
            <span className="text-[#64748B]">Restaurant nou</span>
          )}
        </div>
      </Link>
    </li>
  );
}
