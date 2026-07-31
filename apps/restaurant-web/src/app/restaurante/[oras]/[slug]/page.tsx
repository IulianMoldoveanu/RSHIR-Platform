// Lane HIRforYOU-MARKETPLACE (2026-05-28) — /restaurante/[oras]/[slug]
// restaurant detail page in marketplace context.
//
// MVP scope: read-only menu preview + reviews + CTA that hands off to the
// tenant's canonical storefront URL for the actual order flow. This keeps
// the existing cart + checkout pipeline untouched (it lives on the tenant
// host via `resolveTenantFromHost`), so we avoid cross-domain cart sync
// for the first release. A followup (see PR body) lifts the cart into the
// marketplace surface so customers can stay on hirforyou.ro throughout.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, MapPin, Star, ExternalLink } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { getLocale } from '@/lib/i18n/server';
import { formatRon } from '@/lib/format';
import { safeJsonLd } from '@/lib/jsonld';
import {
  canonicalBaseUrl,
  breadcrumbJsonLd,
  marketingOgImageUrl,
  tenantCanonicalUrl,
} from '@/lib/seo-marketing';
import { headers } from 'next/headers';
import { getMenuByTenant } from '@/lib/menu';
import {
  getDirectoryEntry,
  listLatestReviews,
} from '@/lib/marketplace/directory';

export const runtime = 'nodejs';
export const revalidate = 600;
export const dynamicParams = true;

const PRIMARY_DOMAIN = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || '';
const CANONICAL_BASE = PRIMARY_DOMAIN
  ? `https://${PRIMARY_DOMAIN}`
  : 'https://hir-restaurant-web.vercel.app';

type Params = { params: Promise<{ oras: string; slug: string }> };

export async function generateMetadata(props: Params): Promise<Metadata> {
  const { oras, slug } = await props.params;
  const row = await getDirectoryEntry(oras, slug);
  if (!row) return { robots: { index: false, follow: false } };

  const title = `${row.name} — Comandă online | HIR`;
  const description = row.tagline
    ? `${row.tagline}. Comandă online prin HIR. ${row.city_name ?? ''}`.trim()
    : `Comandă din ${row.name}${row.city_name ? `, ${row.city_name}` : ''}. Prețul afișat = prețul plătit.`;
  const url = `${CANONICAL_BASE}/restaurante/${oras}/${slug}`;
  const og = marketingOgImageUrl({
    title: row.name,
    subtitle: row.tagline ?? description,
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
      title: row.name,
      description,
      url,
      type: 'website',
      locale: 'ro_RO',
      images: row.logo_url
        ? [{ url: row.logo_url, width: 1200, height: 630, alt: row.name }]
        : [{ url: og, width: 1200, height: 630, alt: row.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: row.name,
      description,
      images: row.logo_url ? [row.logo_url] : [og],
    },
    robots: { index: true, follow: true },
  };
}

export default async function MarketplaceRestaurantPage(props: Params) {
  const { oras, slug } = await props.params;
  const currentLocale = getLocale();
  const row = await getDirectoryEntry(oras, slug);
  if (!row) notFound();

  const [menu, reviews] = await Promise.all([
    getMenuByTenant(row.tenant_id),
    listLatestReviews(row.tenant_id, 10),
  ]);

  const storefrontUrl = tenantCanonicalUrl({
    slug: row.slug,
    custom_domain: row.custom_domain,
  });

  const host =
    (await headers()).get('x-hir-host') ?? (await headers()).get('host')?.split(':')[0] ?? '';
  const baseUrl = canonicalBaseUrl(host);
  const breadcrumb = breadcrumbJsonLd(baseUrl, [
    { name: 'Acasă', path: '/' },
    { name: 'Restaurante', path: '/restaurante' },
    ...(row.city_slug && row.city_name
      ? [{ name: row.city_name, path: `/restaurante/${row.city_slug}` }]
      : []),
    { name: row.name, path: `/restaurante/${oras}/${slug}` },
  ]);

  // schema.org/Restaurant + AggregateRating for rich result eligibility.
  const restaurantLd = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: row.name,
    url: `${CANONICAL_BASE}/restaurante/${oras}/${slug}`,
    image: row.logo_url ?? undefined,
    description: row.tagline ?? undefined,
    address: row.city_name
      ? {
          '@type': 'PostalAddress',
          addressLocality: row.city_name,
          addressCountry: 'RO',
        }
      : undefined,
    aggregateRating:
      row.review_count > 0
        ? {
            '@type': 'AggregateRating',
            ratingValue: row.avg_rating,
            reviewCount: row.review_count,
          }
        : undefined,
  };

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(restaurantLd) }}
      />
      <MarketingHeader currentLocale={currentLocale} />

      {/* Restaurant header */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            {row.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.logo_url}
                alt={row.name}
                className="h-24 w-24 flex-none rounded-2xl object-cover ring-1 ring-[#E2E8F0]"
              />
            ) : (
              <div
                className="flex h-24 w-24 flex-none items-center justify-center rounded-2xl bg-[#4F46E5] text-3xl font-semibold text-white"
                aria-hidden="true"
              >
                {row.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{row.name}</h1>
              {row.tagline ? (
                <p className="mt-2 text-base text-[#475569]">{row.tagline}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                {row.review_count > 0 ? (
                  <span className="inline-flex items-center gap-1 font-medium">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {row.avg_rating.toFixed(1)}
                    <span className="text-[#64748B]">
                      ({row.review_count} {row.review_count === 1 ? 'recenzie' : 'recenzii'})
                    </span>
                  </span>
                ) : (
                  <span className="text-[#64748B]">Restaurant nou — fii primul care lasă o recenzie</span>
                )}
                {row.city_name ? (
                  <span className="inline-flex items-center gap-1 text-[#64748B]">
                    <MapPin className="h-4 w-4" />
                    {row.city_name}
                  </span>
                ) : null}
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a
                  href={storefrontUrl}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#4338CA]"
                >
                  Comandă acum
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href={storefrontUrl}
                  className="inline-flex items-center gap-1 text-sm font-medium text-[#4F46E5] hover:underline"
                >
                  Vezi site-ul propriu <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Menu preview */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
        <h2 className="text-2xl font-semibold tracking-tight">Meniu</h2>
        {menu.length === 0 ? (
          <p className="mt-4 text-sm text-[#475569]">
            Meniul nu este încă publicat. Revino mai târziu sau{' '}
            <a href={storefrontUrl} className="font-medium text-[#4F46E5] hover:underline">
              vizitează site-ul restaurantului
            </a>{' '}
            pentru detalii.
          </p>
        ) : (
          <div className="mt-6 space-y-10">
            {menu.map((category) => (
              <div key={category.id}>
                <h3 className="text-lg font-semibold tracking-tight">{category.name}</h3>
                <ul className="mt-4 divide-y divide-[#E2E8F0] rounded-2xl border border-[#E2E8F0] bg-white">
                  {category.items.slice(0, 8).map((item) => (
                    <li key={item.id} className="flex items-start gap-4 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#0F172A]">{item.name}</p>
                        {item.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-[#64748B]">
                            {item.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex-none text-sm font-semibold text-[#0F172A]">
                        {formatRon(item.price_ron, 'ro')}
                      </div>
                    </li>
                  ))}
                </ul>
                {category.items.length > 8 ? (
                  <p className="mt-3 text-xs text-[#64748B]">
                    +{category.items.length - 8} alte produse — vezi meniul complet pe site-ul
                    restaurantului.
                  </p>
                ) : null}
              </div>
            ))}
            <div className="rounded-2xl border border-[#C7D2FE] bg-[#EEF2FF] p-6">
              <p className="text-sm font-medium text-[#0F172A]">
                Plasează comanda pe site-ul restaurantului
              </p>
              <p className="mt-1 text-sm text-[#475569]">
                Vei fi redirecționat către site-ul oficial al {row.name}. Prețul de pe meniu = prețul
                pe care îl plătești.
              </p>
              <a
                href={storefrontUrl}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#4338CA]"
              >
                Continuă comanda
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        )}
      </section>

      {/* Reviews */}
      {reviews.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
          <h2 className="text-2xl font-semibold tracking-tight">Recenzii recente</h2>
          <ul className="mt-6 space-y-4">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="rounded-2xl border border-[#E2E8F0] bg-white p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={
                            i < review.rating
                              ? 'h-4 w-4 fill-amber-400 text-amber-400'
                              : 'h-4 w-4 text-[#CBD5E1]'
                          }
                        />
                      ))}
                    </span>
                    <span className="text-sm font-medium text-[#0F172A]">
                      {review.full_name ?? 'Anonim'}
                    </span>
                  </div>
                  <time className="text-xs text-[#64748B]" dateTime={review.created_at}>
                    {new Date(review.created_at).toLocaleDateString('ro-RO')}
                  </time>
                </div>
                {review.comment ? (
                  <p className="mt-3 text-sm leading-relaxed text-[#475569]">{review.comment}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <MarketingFooter currentLocale={currentLocale} />
    </main>
  );
}
