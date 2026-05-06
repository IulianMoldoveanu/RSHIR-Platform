// Lane STOREFRONT-CITY-LANDING (2026-05-06) — `/orase/[citySlug]` page.
//
// Static-by-default per-city listing. `generateStaticParams` enumerates all
// active cities at build time so the 12 launch cities ship as ISR pages.
//
// Resolves tenants via canonical FK (`tenants.city_id`) PLUS the legacy
// free-text fallback (`tenants.settings.city`) so newly-onboarded and
// pre-#299 tenants both surface. Empty cities still render a useful page
// with a "be the first" CTA — that's the reseller pitch hook.
//
// Rendering rules:
//   - Server component, no client fetching on first paint
//   - Mobile-first: single-column grid → 2-col @ sm → 3-col @ lg
//   - JSON-LD: BreadcrumbList + LocalBusiness per tenant card
//   - Romanian formal microcopy via i18n; URL stays `/orase/<slug>` in
//     both locales (slug is the canonical city handle)

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, MapPin, Sparkles } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { EmptyState } from '@/components/storefront/empty-state';
import { getLocale } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import { safeJsonLd } from '@/lib/jsonld';
import {
  canonicalBaseUrl,
  breadcrumbJsonLd,
  marketingOgImageUrl,
  tenantCanonicalUrl,
} from '@/lib/seo-marketing';
import { brandingFor, type TenantSettings } from '@/lib/tenant';
import {
  getCityBySlug,
  listActiveCities,
  listTenantsByCity,
  type CityRow,
  type TenantCardRow,
} from '@/lib/cities';
import { headers } from 'next/headers';

export const runtime = 'nodejs';
export const revalidate = 3600;
export const dynamicParams = true;

const PRIMARY_DOMAIN = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || '';
const CANONICAL_BASE = PRIMARY_DOMAIN
  ? `https://${PRIMARY_DOMAIN}`
  : 'https://hir-restaurant-web.vercel.app';

// 7-day window controls the "Nou pe HIR" badge on tenant cards.
const NEW_BADGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// Hard cap on tenants rendered per city (matches storefront bandwidth budget;
// >50 → paginate when we ever ship a city that big).
const TENANT_CAP = 50;

type Params = { params: { citySlug: string } };

export async function generateStaticParams() {
  const cities = await listActiveCities();
  return cities.map((c) => ({ citySlug: c.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = getLocale();
  const city = await getCityBySlug(params.citySlug);
  if (!city) {
    return { robots: { index: false, follow: false } };
  }
  const title = t(locale, 'marketing.cities.city_page_title_template', {
    city: city.name,
  });
  const description = t(locale, 'marketing.cities.city_page_description_template', {
    city: city.name,
  });
  const url = `${CANONICAL_BASE}/orase/${city.slug}`;
  const og = marketingOgImageUrl({
    title: city.name,
    subtitle: t(locale, 'marketing.cities.city_hero_title_template', { city: city.name }),
    variant: 'default',
  });
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, en: url, 'x-default': url },
    },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      locale: locale === 'en' ? 'en_GB' : 'ro_RO',
      images: [{ url: og, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [og] },
    robots: { index: true, follow: true },
  };
}

function isNewTenant(createdAt: string | null): boolean {
  if (!createdAt) return false;
  const ts = Date.parse(createdAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < NEW_BADGE_WINDOW_MS;
}

// schema.org/LocalBusiness per tenant — gives Google rich-result eligibility
// for each restaurant card without forcing a full Restaurant block (that's
// owned by the tenant storefront). `address.addressLocality` ties the
// listing back to the city query.
function tenantLocalBusinessJsonLd(input: {
  name: string;
  url: string;
  cityName: string;
  county: string | null;
  imageUrl: string | null;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: input.name,
    url: input.url,
    image: input.imageUrl ?? undefined,
    address: {
      '@type': 'PostalAddress',
      addressLocality: input.cityName,
      addressRegion: input.county ?? undefined,
      addressCountry: 'RO',
    },
  };
}

export default async function CityLandingPage({ params }: Params) {
  const currentLocale = getLocale();
  const city = await getCityBySlug(params.citySlug);
  if (!city) {
    notFound();
  }

  const tenants = await listTenantsByCity(city, TENANT_CAP);
  const host =
    headers().get('x-hir-host') ?? headers().get('host')?.split(':')[0] ?? '';
  const baseUrl = canonicalBaseUrl(host);

  const breadcrumb = breadcrumbJsonLd(baseUrl, [
    { name: t(currentLocale, 'marketing.cities.city_breadcrumb_home'), path: '/' },
    { name: t(currentLocale, 'marketing.cities.city_breadcrumb_cities'), path: '/orase' },
    { name: city.name, path: `/orase/${city.slug}` },
  ]);

  const businessLdScripts = tenants.map((tenant) => {
    const settings = (tenant.settings ?? {}) as TenantSettings;
    const { logoUrl } = brandingFor(settings);
    return tenantLocalBusinessJsonLd({
      name: tenant.name,
      url: tenantCanonicalUrl({ slug: tenant.slug, custom_domain: tenant.custom_domain }),
      cityName: city.name,
      county: city.county,
      imageUrl: logoUrl,
    });
  });

  const heroSubtitle =
    tenants.length === 0
      ? t(currentLocale, 'marketing.cities.city_hero_subtitle_empty', { city: city.name })
      : tenants.length === 1
        ? t(currentLocale, 'marketing.cities.city_hero_subtitle_active_one', { city: city.name })
        : t(currentLocale, 'marketing.cities.city_hero_subtitle_active_other', {
            city: city.name,
            count: tenants.length,
          });

  return (
    <main
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumb) }}
      />
      {businessLdScripts.map((ld, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(ld) }}
        />
      ))}
      <MarketingHeader currentLocale={currentLocale} />

      {/* Hero */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 md:py-20">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            <MapPin className="h-3.5 w-3.5" />
            {t(currentLocale, 'marketing.cities.city_hero_eyebrow_template', {
              county: city.county ?? 'România',
            })}
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
            {t(currentLocale, 'marketing.cities.city_hero_title_template', {
              city: city.name,
            })}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#475569]">
            {heroSubtitle}
          </p>
        </div>
      </section>

      {/* Tenant grid OR empty state */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        {tenants.length === 0 ? (
          <EmptyState
            icon={<MapPin className="h-7 w-7 text-purple-700" />}
            title={t(currentLocale, 'marketing.cities.city_empty_title', { city: city.name })}
            description={t(currentLocale, 'marketing.cities.city_empty_body', { city: city.name })}
            action={{
              label: t(currentLocale, 'marketing.cities.city_empty_cta_signup'),
              href: '/migrate-from-gloriafood',
            }}
          >
            <Link
              href="/affiliate"
              className="text-sm font-medium text-purple-700 underline-offset-4 hover:underline"
            >
              {t(currentLocale, 'marketing.cities.city_empty_cta_partner')}
            </Link>
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tenants.map((tenant) => (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                currentLocale={currentLocale}
              />
            ))}
          </ul>
        )}
      </section>

      <MarketingFooter currentLocale={currentLocale} />
    </main>
  );
}

function TenantCard({
  tenant,
  currentLocale,
}: {
  tenant: TenantCardRow;
  currentLocale: 'ro' | 'en';
}) {
  const settings = (tenant.settings ?? {}) as TenantSettings;
  const { logoUrl, brandColor } = brandingFor(settings);
  const href = tenantCanonicalUrl({
    slug: tenant.slug,
    custom_domain: tenant.custom_domain,
  });
  // Lane PRESENTATION (2026-05-06) — surface the optional `/poveste` page
  // when the tenant has explicitly enabled it. Off by default for every
  // existing tenant so this stays purely additive. `tenantCanonicalUrl`
  // always returns a clean origin (no path, no query), so direct
  // concatenation is safe.
  const presentationEnabled = settings.presentation_enabled === true;
  const povesteHref = presentationEnabled ? `${href}/poveste` : null;
  const cuisine =
    typeof settings.tagline === 'string' && settings.tagline.trim().length > 0
      ? settings.tagline
      : t(currentLocale, 'marketing.cities.city_grid_card_cuisine_default');
  const showNewBadge = isNewTenant(tenant.created_at);

  return (
    <li>
      <div className="group flex h-full flex-col rounded-2xl border border-[#E2E8F0] bg-white p-5 transition-colors hover:border-[#C7D2FE] hover:bg-[#F8FAFC]">
        <a href={href} className="flex items-start gap-4">
          {logoUrl ? (
            // External logos served from Supabase Storage. <img> is fine
            // here — these are listing-card thumbnails, no LCP hot path.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              loading="lazy"
              className="h-14 w-14 flex-none rounded-xl object-cover ring-1 ring-[#E2E8F0]"
            />
          ) : (
            <div
              className="flex h-14 w-14 flex-none items-center justify-center rounded-xl text-base font-semibold text-white"
              style={{ backgroundColor: brandColor }}
              aria-hidden="true"
            >
              {tenant.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="truncate text-base font-semibold tracking-tight text-[#0F172A]">
                {tenant.name}
              </h2>
              {showNewBadge && (
                <span className="inline-flex flex-none items-center gap-1 rounded-md bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#B45309] ring-1 ring-inset ring-[#FDE68A]">
                  <Sparkles className="h-3 w-3" />
                  {t(currentLocale, 'marketing.cities.city_grid_card_new_badge')}
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-[#64748B]">{cuisine}</p>
          </div>
        </a>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <a
            href={href}
            className="inline-flex items-center gap-1 font-medium text-[#4F46E5] hover:gap-2 transition-all"
          >
            {t(currentLocale, 'marketing.cities.city_grid_card_view_menu')}
            <ArrowRight className="h-4 w-4" />
          </a>
          {povesteHref ? (
            <a
              href={povesteHref}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#64748B] hover:text-[#4F46E5]"
            >
              Vezi povestea
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}
