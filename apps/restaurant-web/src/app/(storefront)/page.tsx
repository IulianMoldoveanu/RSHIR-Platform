/// <reference types="react-dom/canary" />
import type { Metadata } from 'next';
import ReactDOM from 'react-dom';
import { ChefHat } from 'lucide-react';
import { MarketingHome } from '@/components/marketing/marketing-home';
import { EmptyState } from '@/components/storefront/empty-state';
import { NotifyWhenLiveForm } from '@/components/storefront/notify-when-live-form';
import { brandingFor, resolveTenantFromHost, tenantBaseUrl, type TenantSettings } from '@/lib/tenant';
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
import {
  canonicalBaseUrl,
  organizationJsonLd,
  websiteJsonLd,
  localBusinessJsonLd,
  softwareApplicationJsonLd,
  faqPageJsonLd,
} from '@/lib/seo-marketing';
import { MobileStickyCta } from '@/components/marketing/mobile-sticky-cta';
import { headers } from 'next/headers';
import { buildRestaurantJsonLd, buildMenuJsonLd } from '@/lib/seo/jsonld-helpers';
import { SocialShare } from '@/components/storefront/social-share';
import { PixelScripts } from '@/components/analytics/pixel-scripts';
import { hasAnalyticsConsent, hasMarketingConsent } from '@/lib/consent.server';

export async function generateMetadata(): Promise<Metadata> {
  const { tenant } = await resolveTenantFromHost();
  const locale = getLocale();
  if (!tenant) {
    // Lane H marketing landing — only on canonical hosts with no tenant.
    // SEO audit 2026-05-10 #1 — RO is the only canonical metadata language
    // for hirforyou.ro homepage. Visitor toggles to EN remain available via
    // the in-page locale switcher cookie, but the SERP snippet, OpenGraph
    // locale, and `<html lang>` are pinned to RO so Google indexes a single
    // canonical RO version and avoids hreflang split-content penalties.
    // Tenant storefronts (else branch below) continue to use `getLocale()`.
    const title = t('ro', 'marketing.home.page_title');
    const description = t('ro', 'marketing.home.page_description');
    const host =
      (await headers()).get('x-hir-host') ?? (await headers()).get('host')?.split(':')[0] ?? '';
    const url = `${canonicalBaseUrl(host)}/`;
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
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
      },
      robots: { index: true, follow: true },
    };
  }
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
      siteName: tenant.name,
      images: coverUrl ? [{ url: coverUrl, width: 1200, height: 630, alt: tenant.name }] : undefined,
      type: 'website',
      locale: locale === 'en' ? 'en_GB' : 'ro_RO',
    },
    twitter: {
      card: coverUrl ? 'summary_large_image' : 'summary',
      title: tenant.name,
      description,
      images: coverUrl ? [coverUrl] : undefined,
    },
  };
}

export default async function StorefrontHomePage() {
  const { tenant } = await resolveTenantFromHost();
  // Lane H 2026-05-04: when no tenant resolves on the canonical Vercel host
  // (no ?tenant= override, no custom domain match) we render the HIR brand
  // marketing landing. Replaces the previous notFound() (TODO-demo-2026-05-05).
  // Tenant subdomains and custom domains continue to render the storefront
  // menu unchanged.
  if (!tenant) {
    // SEO audit 2026-05-10 #1 — marketing landing is pinned to RO.
    // hirforyou.ro targets RO restaurant patrons, so the canonical
    // homepage indexed by Google is RO-only. EN remains accessible via
    // the locale cookie + alternate marketing pages but the homepage
    // body is no longer Accept-Language-driven.
    //
    // SEO audit 2026-05-10 #4 — Organization, WebSite, LocalBusiness,
    // SoftwareApplication, FAQPage JSON-LD are surfaced on the homepage
    // for rich SERP results.
    //
    // SEO audit 2026-05-10 #5 — `MobileStickyCta` adds the bottom-fixed
    // call/whatsapp/demo bar visible only on viewports < md.
    const host =
      (await headers()).get('x-hir-host') ?? (await headers()).get('host')?.split(':')[0] ?? '';
    const baseUrl = canonicalBaseUrl(host);
    const homepageFaq = [
      {
        question: 'Cât costă HIRforYOU?',
        answer:
          '2 lei per comandă livrată. Fără abonament, fără comision procentual din valoarea coșului.',
      },
      {
        question: 'Cum mă mut de pe GloriaFood pe HIRforYOU?',
        answer:
          'Echipa noastră preia meniul și butonul de comandă, înlocuiește integrarea actuală în 24-48 de ore. Migrarea este GRATUITĂ pentru primele 50 de restaurante.',
      },
      {
        question: 'Ce diferență față de Glovo / Wolt / Bolt?',
        answer:
          'HIRforYOU este SOFTWARE-ul restaurantului, nu un agregator. Restaurantul își păstrează clienții, datele, brandul. Plătiți 2 lei pe comandă, nu un comision tipic 25-30% (variază în funcție de contractul cu agregatorul).',
      },
      {
        question: 'AI-ul vorbește română?',
        answer:
          'Da. Modelele sunt configurate pentru română formală (dumneavoastră), cu suport pentru EN dacă restaurantul preferă.',
      },
    ];
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(organizationJsonLd(baseUrl)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(websiteJsonLd(baseUrl)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(localBusinessJsonLd(baseUrl)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(softwareApplicationJsonLd(baseUrl)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(faqPageJsonLd(homepageFaq)) }}
        />
        <MarketingHome currentLocale="ro" />
        <MobileStickyCta />
      </>
    );
  }

  const locale = getLocale();
  const { logoUrl, coverUrl, brandColor } = brandingFor(tenant.settings);
  // Lane PERF (2026-05-05) — preload the LCP cover image so the browser
  // starts the fetch before parsing <body>. ReactDOM.preload emits a
  // <link rel="preload" as="image"> hoisted into <head> and is deduped by
  // React. Skips when no cover is configured. Logo is much smaller and
  // already eager+priority on the <img>; preloading it would compete with
  // the cover for early-bandwidth slots.
  if (coverUrl) {
    ReactDOM.preload(coverUrl, { as: 'image', fetchPriority: 'high' });
  }
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

  const restaurantJsonLd = buildRestaurantJsonLd({
    name: tenant.name,
    url: `${baseUrl}/`,
    imageUrl: coverUrl,
    telephone: phone,
    cuisine,
    pickupAddress,
    rating,
    hasMenuUrl: `${baseUrl}/`,
  });
  const menuJsonLd = buildMenuJsonLd(baseUrl, menu);

  // Lane I (2026-05-04) — social settings (JSONB, all optional).
  const socialSettings = tenant.settings as TenantSettings & {
    fb_pixel_id?: string | null;
    ga4_measurement_id?: string | null;
  };
  const homeShareMessage = t(locale, 'social.home_share_message_template', {
    name: tenant.name,
  });

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
      {menu.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(menuJsonLd) }}
        />
      )}
      {/* GDPR / Legea 506/2004 — pixels only fire after explicit opt-in.
          GA4 is gated by analytics consent, Facebook Pixel by marketing
          consent. The cookie is set by /api/consent so a fresh navigation
          after the user picks "Accept all" or saves custom prefs picks the
          correct flags up server-side. */}
      <PixelScripts
        fbPixelId={hasMarketingConsent() ? socialSettings.fb_pixel_id ?? null : null}
        ga4MeasurementId={hasAnalyticsConsent() ? socialSettings.ga4_measurement_id ?? null : null}
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
      {menu.length > 0 && (
        <section className="mx-auto mt-8 max-w-2xl px-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            {t(locale, 'social.share_label')}
          </p>
          <SocialShare
            url={`${baseUrl}/`}
            text={homeShareMessage}
            tenantSlug={tenant.slug}
            labels={{
              share: t(locale, 'social.share_label'),
              whatsapp: t(locale, 'social.share_whatsapp'),
              facebook: t(locale, 'social.share_facebook'),
              twitter: t(locale, 'social.share_twitter'),
              telegram: t(locale, 'social.share_telegram'),
              copy: t(locale, 'social.copy_link'),
              copied: t(locale, 'social.link_copied'),
            }}
          />
        </section>
      )}
      <NewsletterPopup brandColor={brandColor} locale={locale} />
    </main>
  );
}
