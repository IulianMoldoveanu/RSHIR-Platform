// Replaces the old `/features` page (a 9-card wall of feature copy) with a
// screenshot-led walkthrough, per Iulian 2026-08-01: "pagina functionalitati
// schimba o cu 'cum functioneaza?' unde vei arata cativa pasi simpli cu
// capturi de ecran din aplicatii ... putin scris, usor de inteles."
//
// One row per step: a number, a short title, one sentence, one real
// screenshot. Rows alternate sides on desktop and stack image-first on
// mobile. `/features` 301s here (see next.config.mjs).

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { MarketingHeader, MarketingFooter } from '@/components/marketing/marketing-shell';
import { GuideShot } from '@/components/marketing/guide-shot';
import { GUIDE_STEPS } from '@/lib/marketing/guide-steps';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { canonicalBaseUrl, marketingOgImageUrl } from '@/lib/seo-marketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const title = t(locale, 'marketing.guide.page_title');
  const description = t(locale, 'marketing.guide.page_description');
  const ogImage = marketingOgImageUrl({ title, subtitle: description });
  const h = await headers();
  const host = h.get('x-hir-host') ?? h.get('host')?.split(':')[0] ?? '';
  const url = `${canonicalBaseUrl(host)}/cum-functioneaza`;
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
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function HowItWorksPage() {
  const currentLocale = await getLocale();

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <MarketingHeader active="/cum-functioneaza" currentLocale={currentLocale} />

      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <h1 className="max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            {t(currentLocale, 'marketing.guide.hero_title')}
          </h1>
          <p className="mt-4 text-base text-[#475569]">
            {t(currentLocale, 'marketing.guide.hero_intro')}
          </p>
        </div>
      </section>

      <ol className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
        {GUIDE_STEPS.map((step, i) => (
          <li
            key={step.n}
            className="grid items-center gap-8 border-b border-[#E2E8F0] py-12 last:border-b-0 md:grid-cols-2 md:gap-14 md:py-16"
          >
            <div className={i % 2 === 1 ? 'md:order-2' : undefined}>
              <span
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EEF2FF] text-lg font-bold text-[#4F46E5]"
                aria-hidden
              >
                {step.n}
              </span>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">
                {t(currentLocale, step.titleKey)}
              </h2>
              <p className="mt-3 max-w-md text-base leading-relaxed text-[#475569]">
                {t(currentLocale, step.bodyKey)}
              </p>
            </div>
            <div className={i % 2 === 1 ? 'md:order-1' : undefined}>
              <GuideShot
                src={step.src}
                alt={t(currentLocale, step.titleKey)}
                width={step.width}
                height={step.height}
                frame={step.frame}
                priority={step.n === 1}
              />
            </div>
          </li>
        ))}
      </ol>

      <section className="border-t border-[#E2E8F0] bg-[#0F172A] text-white">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {t(currentLocale, 'marketing.guide.cta_title')}
          </h2>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/demo-storefront"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white shadow-md shadow-[#4F46E5]/25 ring-1 ring-inset ring-[#4338CA] transition-all hover:bg-[#4338CA]"
            >
              {t(currentLocale, 'marketing.guide.cta_demo')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-md border border-white/20 px-5 py-3 text-sm font-medium text-white hover:bg-white/5"
            >
              {t(currentLocale, 'marketing.guide.cta_contact')}
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter currentLocale={currentLocale} />
    </main>
  );
}
