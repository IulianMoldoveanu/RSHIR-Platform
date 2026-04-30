import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChefHat } from 'lucide-react';
import { EmptyState } from '@/components/storefront/empty-state';
import { NotifyWhenLiveForm } from '@/components/storefront/notify-when-live-form';
import { brandingFor, resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { readCustomerCookie } from '@/lib/customer-recognition';
import { getMenuByTenant, getRecentlyOrderedItems } from '@/lib/menu';
import { getReviewSummary } from '@/lib/reviews';
import { TenantHeader } from '@/components/storefront/tenant-header';
import { safeJsonLd } from '@/lib/jsonld';
import { MenuList } from '@/components/storefront/menu-list';
import { ReorderRail } from '@/components/storefront/reorder-rail';
import { FreeDeliveryProgress } from '@/components/storefront/free-delivery-progress';
import { getTodayOrderCount } from '@/lib/orders/today-count';
import { isReservationsEnabled } from '@/lib/reservations';
import { getLoyaltyBalance } from '@/lib/loyalty';
import { NewsletterPopup } from '@/components/storefront/newsletter-popup';
import { NewsletterBanner } from '@/components/storefront/newsletter-banner';
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
  const { logoUrl, coverUrl, brandColor } = brandingFor(tenant.settings);
  const [menu, rating, todayOrderCount, reservationsEnabled] = await Promise.all([
    getMenuByTenant(tenant.id),
    getReviewSummary(tenant.id),
    getTodayOrderCount(tenant.id),
    isReservationsEnabled(tenant.id),
  ]);
  const accepting = isAcceptingOrders(tenant.settings);
  const openStatus = isOpenNow(tenant.settings);
  const closed = !accepting || !openStatus.open;
  const customerId = readCustomerCookie(tenant.id);
  const hasCustomerCookie = customerId !== null;
  const [reorderItems, loyalty] = await Promise.all([
    customerId ? getRecentlyOrderedItems(tenant.id, customerId, menu) : Promise.resolve([]),
    customerId ? getLoyaltyBalance(tenant.id, customerId) : Promise.resolve(null),
  ]);

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

  const freeDeliveryThresholdRon =
    typeof tenant.settings.free_delivery_threshold_ron === 'number' &&
    tenant.settings.free_delivery_threshold_ron > 0
      ? Number(tenant.settings.free_delivery_threshold_ron)
      : 0;

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
      <NewsletterBanner />
      <TenantHeader
        name={tenant.name}
        logoUrl={logoUrl}
        coverUrl={coverUrl}
        whatsappPhone={tenant.settings.whatsapp_phone ?? null}
        locale={locale}
        showAccountLink={hasCustomerCookie}
        reservationsEnabled={reservationsEnabled}
        loyaltyPoints={loyalty?.points ?? null}
        rating={rating}
        minOrderRon={
          typeof tenant.settings.min_order_ron === 'number' && tenant.settings.min_order_ron > 0
            ? Number(tenant.settings.min_order_ron)
            : 0
        }
        freeDeliveryThresholdRon={freeDeliveryThresholdRon}
        todayOrderCount={todayOrderCount}
        deliveryEtaMinMinutes={
          typeof tenant.settings.delivery_eta_min_minutes === 'number' &&
          tenant.settings.delivery_eta_min_minutes > 0
            ? Number(tenant.settings.delivery_eta_min_minutes)
            : 0
        }
        deliveryEtaMaxMinutes={
          typeof tenant.settings.delivery_eta_max_minutes === 'number' &&
          tenant.settings.delivery_eta_max_minutes > 0
            ? Number(tenant.settings.delivery_eta_max_minutes)
            : 0
        }
      />

      <FreeDeliveryProgress thresholdRon={freeDeliveryThresholdRon} locale={locale} />

      {closed && banner && (
        <div className="mx-auto mt-3 max-w-2xl px-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">{banner.title}</p>
            {banner.detail && <p className="mt-0.5 text-xs">{banner.detail}</p>}
            {(phone || reservationsEnabled) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {phone && (
                  <a
                    href={`tel:${phone}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-amber-900 ring-1 ring-amber-300 transition-colors hover:bg-amber-100"
                  >
                    {t(locale, 'home.banner_call_template', { phone })}
                  </a>
                )}
                {tenant.settings.whatsapp_phone && (
                  <a
                    href={`https://wa.me/${(tenant.settings.whatsapp_phone ?? '').replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
                  >
                    {t(locale, 'home.banner_whatsapp')}
                  </a>
                )}
                {reservationsEnabled && (
                  <a
                    href="/rezervari"
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-purple-600 px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-purple-700"
                  >
                    {t(locale, 'home.banner_book_table')}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {reorderItems.length > 0 && !closed && (
        <div className="mx-auto max-w-2xl">
          <ReorderRail items={reorderItems} locale={locale} />
        </div>
      )}

      {menu.length === 0 ? (
        <div className="mx-auto mt-10 max-w-2xl px-4">
          <EmptyState
            icon={<ChefHat className="h-8 w-8 text-purple-400" />}
            title={t(locale, 'storefront.empty_menu_title')}
            description={t(locale, 'storefront.empty_menu_desc')}
          >
            <NotifyWhenLiveForm tenantSlug={tenant.slug} locale={locale} />
          </EmptyState>
        </div>
      ) : (
        <MenuList categories={menu} locale={locale} />
      )}

      <NewsletterPopup brandColor={brandColor} locale={locale} />
    </main>
  );
}
