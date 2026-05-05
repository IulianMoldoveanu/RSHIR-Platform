import type { Metadata } from 'next';
import {
  Truck,
  ChefHat,
  Zap,
  ShieldCheck,
  Users,
  BarChart3,
  Bell,
  CreditCard,
  MapPin,
  MessageSquare,
  Star,
  Smartphone,
} from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { headers } from 'next/headers';
import { t, type TKey } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { canonicalBaseUrl, marketingOgImageUrl } from '@/lib/seo-marketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lane EN-I18N (2026-05-05) — switched static `metadata` to async
// `generateMetadata()` so the SERP snippet matches the visitor locale
// (RO ↔ EN).
export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  const title = t(locale, 'marketing.features.page_title');
  const description = t(locale, 'marketing.features.page_description');
  const ogImage = marketingOgImageUrl({
    title: t(locale, 'marketing.features.og_title'),
    subtitle: t(locale, 'marketing.features.og_subtitle'),
  });
  const host =
    headers().get('x-hir-host') ?? headers().get('host')?.split(':')[0] ?? '';
  const url = `${canonicalBaseUrl(host)}/features`;
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, en: url, 'x-default': url },
    },
    openGraph: {
      title,
      description: t(locale, 'marketing.features.og_description'),
      url,
      type: 'website',
      locale: locale === 'en' ? 'en_GB' : 'ro_RO',
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: t(locale, 'marketing.features.og_description'),
      images: [ogImage],
    },
    robots: { index: true, follow: true },
  };
}

// Group definitions stay at module scope; only the `i18n` keys are stored
// (resolved at render time once `getLocale()` is available).
type FeatureGroup = {
  titleKey: TKey;
  introKey: TKey;
  items: { icon: React.ReactNode; titleKey: TKey; bodyKey: TKey }[];
};

const GROUPS: FeatureGroup[] = [
  {
    titleKey: 'marketing.features.group1_title',
    introKey: 'marketing.features.group1_intro',
    items: [
      {
        icon: <ChefHat className="h-5 w-5" />,
        titleKey: 'marketing.features.item_storefront_title',
        bodyKey: 'marketing.features.item_storefront_body',
      },
      {
        icon: <Zap className="h-5 w-5" />,
        titleKey: 'marketing.features.item_importer_title',
        bodyKey: 'marketing.features.item_importer_body',
      },
      {
        icon: <Smartphone className="h-5 w-5" />,
        titleKey: 'marketing.features.item_responsive_title',
        bodyKey: 'marketing.features.item_responsive_body',
      },
      {
        icon: <BarChart3 className="h-5 w-5" />,
        titleKey: 'marketing.features.item_analytics_title',
        bodyKey: 'marketing.features.item_analytics_body',
      },
      {
        icon: <Bell className="h-5 w-5" />,
        titleKey: 'marketing.features.item_push_title',
        bodyKey: 'marketing.features.item_push_body',
      },
      {
        icon: <CreditCard className="h-5 w-5" />,
        titleKey: 'marketing.features.item_payments_title',
        bodyKey: 'marketing.features.item_payments_body',
      },
    ],
  },
  {
    titleKey: 'marketing.features.group2_title',
    introKey: 'marketing.features.group2_intro',
    items: [
      {
        icon: <Truck className="h-5 w-5" />,
        titleKey: 'marketing.features.item_courier_pricing_title',
        bodyKey: 'marketing.features.item_courier_pricing_body',
      },
      {
        icon: <MapPin className="h-5 w-5" />,
        titleKey: 'marketing.features.item_courier_map_title',
        bodyKey: 'marketing.features.item_courier_map_body',
      },
      {
        icon: <Users className="h-5 w-5" />,
        titleKey: 'marketing.features.item_courier_multifleet_title',
        bodyKey: 'marketing.features.item_courier_multifleet_body',
      },
    ],
  },
  {
    titleKey: 'marketing.features.group3_title',
    introKey: 'marketing.features.group3_intro',
    items: [
      {
        icon: <Star className="h-5 w-5" />,
        titleKey: 'marketing.features.item_loyalty_title',
        bodyKey: 'marketing.features.item_loyalty_body',
      },
      {
        icon: <MessageSquare className="h-5 w-5" />,
        titleKey: 'marketing.features.item_messaging_title',
        bodyKey: 'marketing.features.item_messaging_body',
      },
      {
        icon: <ShieldCheck className="h-5 w-5" />,
        titleKey: 'marketing.features.item_data_title',
        bodyKey: 'marketing.features.item_data_body',
      },
    ],
  },
];

export default function FeaturesPage() {
  const currentLocale = getLocale();
  return (
    <main
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <MarketingHeader active="/features" currentLocale={currentLocale} />

      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-24">
          <div className="mb-3 inline-flex items-center rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            {t(currentLocale, 'marketing.features.eyebrow')}
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
            {t(currentLocale, 'marketing.features.hero_title')}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#475569]">
            {t(currentLocale, 'marketing.features.hero_body')}
          </p>
        </div>
      </section>

      {GROUPS.map((g) => (
        <section key={g.titleKey} className="border-b border-[#E2E8F0] py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t(currentLocale, g.titleKey)}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[#475569]">
              {t(currentLocale, g.introKey)}
            </p>
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {g.items.map((item) => (
                <div
                  key={item.titleKey}
                  className="rounded-lg border border-[#E2E8F0] bg-white p-5"
                >
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[#EEF2FF] text-[#4F46E5]">
                    {item.icon}
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-[#0F172A]">
                    {t(currentLocale, item.titleKey)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#475569]">
                    {t(currentLocale, item.bodyKey)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t(currentLocale, 'marketing.features.demo_title')}
          </h2>
          <p className="mt-3 text-sm text-[#475569]">
            {t(currentLocale, 'marketing.features.demo_body')}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a
              href="/contact"
              className="inline-flex items-center justify-center rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
            >
              {t(currentLocale, 'marketing.features.demo_cta')}
            </a>
            <a
              href="/migrate-from-gloriafood"
              className="inline-flex items-center justify-center rounded-md border border-[#E2E8F0] bg-white px-5 py-3 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
            >
              {t(currentLocale, 'marketing.features.demo_alt_cta')}
            </a>
          </div>
        </div>
      </section>

      <MarketingFooter currentLocale={currentLocale} />
    </main>
  );
}
