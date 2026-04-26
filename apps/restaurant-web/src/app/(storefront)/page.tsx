import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { brandingFor, resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { readCustomerCookie } from '@/lib/customer-recognition';
import { getMenuByTenant } from '@/lib/menu';
import { getReviewSummary } from '@/lib/reviews';
import { TenantHeader } from '@/components/storefront/tenant-header';
import { safeJsonLd } from '@/lib/jsonld';
import { MenuList } from '@/components/storefront/menu-list';
import {
  formatNextOpen,
  isAcceptingOrders,
  isOpenNow,
} from '@/lib/operations';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { metaDescriptionFor } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const { tenant } = await resolveTenantFromHost();
  const locale = getLocale();
  if (!tenant) return { title: t(locale, 'meta.default_title') };
  const description = metaDescriptionFor(
    tenant.settings,
    t(locale, 'meta.home_description_template', { name: tenant.name }),
  );
  const { coverUrl } = brandingFor(tenant.settings);
  const url = `${tenantBaseUrl()}/`;
  return {
    title: t(locale, 'meta.home_title_template', { name: tenant.name }),
    description,
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, en: url, 'x-default': url },
    },
    openGraph: {
      title: tenant.name,
      description,
      url,
      images: coverUrl ? [{ url: coverUrl }] : undefined,
      type: 'website',
      locale: locale === 'en' ? 'en_GB' : 'ro_RO',
    },
  };
}

export default async function StorefrontHomePage() {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const locale = getLocale();
  const { logoUrl, coverUrl } = brandingFor(tenant.settings);
  const [menu, rating] = await Promise.all([
    getMenuByTenant(tenant.id),
    getReviewSummary(tenant.id),
  ]);
  const accepting = isAcceptingOrders(tenant.settings);
  const openStatus = isOpenNow(tenant.settings);
  const closed = !accepting || !openStatus.open;
  const hasCustomerCookie = readCustomerCookie(tenant.id) !== null;

  const baseUrl = tenantBaseUrl();
  const pickupAddress =
    typeof (tenant.settings as { pickup_address?: unknown }).pickup_address === 'string'
      ? ((tenant.settings as { pickup_address?: string }).pickup_address ?? '').trim() || null
      : null;
  const cuisine =
    typeof (tenant.settings as { cuisine?: unknown }).cuisine === 'string'
      ? ((tenant.settings as { cuisine?: string }).cuisine ?? '').trim() || null
      : null;
  const phone = tenant.settings.whatsapp_phone ?? null;

  const restaurantJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: tenant.name,
    image: coverUrl ?? undefined,
    url: `${baseUrl}/`,
    telephone: phone ?? undefined,
    servesCuisine: cuisine ?? undefined,
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      streetAddress: pickupAddress ?? undefined,
      addressCountry: 'RO',
    },
    aggregateRating: rating
      ? {
          '@type': 'AggregateRating',
          ratingValue: rating.average.toFixed(1),
          reviewCount: rating.count,
          bestRating: 5,
          worstRating: 1,
        }
      : undefined,
  };

  let banner: { title: string; detail?: string } | null = null;
  if (!accepting) {
    banner = {
      title: t(locale, 'home.banner_not_accepting_title'),
      detail:
        (tenant.settings as { pause_reason?: string | null }).pause_reason ?? undefined,
    };
  } else if (!openStatus.open) {
    banner = {
      title: t(locale, 'home.banner_closed_title'),
      detail: openStatus.nextOpen
        ? t(locale, 'home.banner_next_open_template', {
            when: formatNextOpen(openStatus.nextOpen, locale),
          })
        : undefined,
    };
  }

  return (
    <main className="min-h-screen bg-zinc-50 pb-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(restaurantJsonLd) }}
      />
      <TenantHeader
        name={tenant.name}
        logoUrl={logoUrl}
        coverUrl={coverUrl}
        whatsappPhone={tenant.settings.whatsapp_phone ?? null}
        locale={locale}
        showAccountLink={hasCustomerCookie}
        rating={rating}
        minOrderRon={
          typeof tenant.settings.min_order_ron === 'number' && tenant.settings.min_order_ron > 0
            ? Number(tenant.settings.min_order_ron)
            : 0
        }
        freeDeliveryThresholdRon={
          typeof tenant.settings.free_delivery_threshold_ron === 'number' &&
          tenant.settings.free_delivery_threshold_ron > 0
            ? Number(tenant.settings.free_delivery_threshold_ron)
            : 0
        }
      />

      {closed && banner && (
        <div className="mx-auto mt-3 max-w-2xl px-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">{banner.title}</p>
            {banner.detail && <p className="mt-0.5 text-xs">{banner.detail}</p>}
          </div>
        </div>
      )}

      {menu.length === 0 ? (
        <div className="mx-auto max-w-2xl">
          <p className="px-4 py-10 text-center text-sm text-zinc-500">
            {t(locale, 'home.menu_not_published')}
          </p>
        </div>
      ) : (
        <MenuList categories={menu} locale={locale} />
      )}
    </main>
  );
}
