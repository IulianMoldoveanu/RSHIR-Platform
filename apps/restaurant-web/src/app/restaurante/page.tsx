// Lane HIRforYOU-MARKETPLACE (2026-05-28) — /restaurante index page.
//
// Consumer-facing global directory. Lists every public-opted-in tenant
// across every city, ranked by 30-day order volume then average rating.
// Filters via URL search params (?oras=brasov&rating=4) so the page stays
// SSR-friendly and shareable.
//
// SEO posture: indexable, single canonical URL, BreadcrumbList JSON-LD,
// hreflang RO-first per the same convention as the marketing home page.
//
// Loads up to `PAGE_SIZE` rows per request; future enhancement (followups
// in PR body) is infinite-scroll via shallow URL updates.

import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, Star, Filter, Search } from 'lucide-react';
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
import {
  listDirectory,
  countDirectory,
  listMarketplaceCities,
  type DirectoryRow,
} from '@/lib/marketplace/directory';

export const runtime = 'nodejs';
export const revalidate = 600; // 10-min ISR; fresh enough for live ratings.

const PRIMARY_DOMAIN = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || '';
const CANONICAL_BASE = PRIMARY_DOMAIN
  ? `https://${PRIMARY_DOMAIN}`
  : 'https://hir-restaurant-web.vercel.app';
const PAGE_URL = `${CANONICAL_BASE}/restaurante`;
const PAGE_SIZE = 20;

type SearchParams = {
  oras?: string;
  rating?: string;
  page?: string;
};

export async function generateMetadata(): Promise<Metadata> {
  // Localization for marketplace strings is intentionally inline here — see
  // the PR body for the followup that promotes these to the typed
  // dictionary once the surface stabilizes.
  const title = 'Restaurante HIR — Comandă fără comisioane Glovo';
  const description =
    'Comandă din restaurantele HIR. Patronii primesc 100% din încasări, tu plătești prețul afișat. Livrare rapidă în România.';
  const og = marketingOgImageUrl({
    title: 'Restaurante HIR',
    subtitle: description,
    variant: 'default',
  });
  return {
    title,
    description,
    alternates: {
      canonical: PAGE_URL,
      languages: { 'ro-RO': PAGE_URL, 'x-default': PAGE_URL },
    },
    openGraph: {
      title,
      description,
      url: PAGE_URL,
      type: 'website',
      locale: 'ro_RO',
      images: [{ url: og, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [og] },
    robots: { index: true, follow: true },
  };
}

export default async function MarketplaceDirectoryPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await props.searchParams;
  const currentLocale = getLocale();

  const citySlug = sp.oras?.trim() || null;
  const ratingFilter = sp.rating ? Number(sp.rating) : null;
  const minRating =
    ratingFilter && Number.isFinite(ratingFilter) && ratingFilter >= 1 && ratingFilter <= 5
      ? ratingFilter
      : null;
  const page = Math.max(1, sp.page ? Number(sp.page) || 1 : 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, totalCount, cities] = await Promise.all([
    listDirectory({ citySlug, minRating, limit: PAGE_SIZE, offset }),
    countDirectory({ citySlug, minRating }),
    listMarketplaceCities(),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const host =
    (await headers()).get('x-hir-host') ?? (await headers()).get('host')?.split(':')[0] ?? '';
  const baseUrl = canonicalBaseUrl(host);
  const breadcrumb = breadcrumbJsonLd(baseUrl, [
    { name: 'Acasă', path: '/' },
    { name: 'Restaurante', path: '/restaurante' },
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
          <div className="mb-3 inline-flex items-center rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            HIRforYOU Marketplace
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
            {totalCount > 0
              ? `Comandă din ${totalCount} restaurante. Fără comisioane de 30%.`
              : 'Restaurante HIR. Fără comisioane de 30%.'}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#475569]">
            Plătești prețul afișat pe meniu. Restaurantul păstrează 100% din încasări minus
            o taxă fixă de 2 lei/comandă, pentru ca patronii să poată investi în calitate.
          </p>

          {/* Search + city filter — server-rendered <form> so it works without JS */}
          <form action="/restaurante" method="get" className="mt-8 flex flex-wrap items-center gap-3">
            <label className="sr-only" htmlFor="city-filter">
              Oraș
            </label>
            <select
              id="city-filter"
              name="oras"
              defaultValue={citySlug ?? ''}
              className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm font-medium text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-2 focus:ring-[#C7D2FE]"
            >
              <option value="">Toate orașele</option>
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="rating-filter">
              Rating minim
            </label>
            <select
              id="rating-filter"
              name="rating"
              defaultValue={minRating ? String(minRating) : ''}
              className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm font-medium text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-2 focus:ring-[#C7D2FE]"
            >
              <option value="">Orice rating</option>
              <option value="4">Peste 4 stele</option>
              <option value="3">Peste 3 stele</option>
            </select>

            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#C7D2FE]"
            >
              <Filter className="h-4 w-4" />
              Filtrează
            </button>
          </form>
        </div>
      </section>

      {/* Grid OR empty state */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Search className="h-7 w-7 text-purple-700" />}
            title="Niciun restaurant nu corespunde filtrelor"
            description="Încearcă alt oraș sau elimină filtrul de rating. Adăugăm restaurante noi săptămânal."
            action={{ label: 'Vezi toate restaurantele', href: '/restaurante' }}
          />
        ) : (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => (
                <DirectoryCard key={row.tenant_id} row={row} />
              ))}
            </ul>

            {totalPages > 1 ? (
              <nav
                className="mt-12 flex items-center justify-center gap-2"
                aria-label="Paginare"
              >
                {page > 1 ? (
                  <Link
                    href={buildPageUrl({ citySlug, minRating, page: page - 1 })}
                    className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                  >
                    ← Anterior
                  </Link>
                ) : null}
                <span className="text-sm text-[#475569]">
                  Pagina {page} din {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={buildPageUrl({ citySlug, minRating, page: page + 1 })}
                    className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                  >
                    Următor →
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </>
        )}
      </section>

      <MarketingFooter currentLocale={currentLocale} />
    </main>
  );
}

function buildPageUrl({
  citySlug,
  minRating,
  page,
}: {
  citySlug: string | null;
  minRating: number | null;
  page: number;
}): string {
  const params = new URLSearchParams();
  if (citySlug) params.set('oras', citySlug);
  if (minRating) params.set('rating', String(minRating));
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/restaurante?${qs}` : '/restaurante';
}

function DirectoryCard({ row }: { row: DirectoryRow }) {
  // Detail URL prefers city + slug; fall back to tenant slug when city
  // metadata is missing (legacy tenant without city_id but eligible).
  const detailHref = row.city_slug
    ? `/restaurante/${row.city_slug}/${row.slug}`
    : `/restaurante/_/${row.slug}`;

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
            {row.city_name ? (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-[#64748B]">
                <MapPin className="h-3 w-3" />
                {row.city_name}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          {row.review_count > 0 ? (
            <span className="inline-flex items-center gap-1 font-medium text-[#0F172A]">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {row.avg_rating.toFixed(1)}
              <span className="text-[#64748B]">({row.review_count})</span>
            </span>
          ) : (
            <span className="text-[#64748B]">Restaurant nou</span>
          )}
          {row.orders_last_30d > 0 ? (
            <span className="text-[#64748B]">{row.orders_last_30d} comenzi/lună</span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
