import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { RoiCalculator } from '@/components/marketing/roi-calculator';
import { getLocale } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import { marketingOgImageUrl, breadcrumbJsonLd } from '@/lib/seo-marketing';
import { safeJsonLd } from '@/lib/jsonld';
import { pricingFaqJsonLd, pricingProductJsonLd } from '@/lib/seo/structured-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lane EN-I18N PR D — canonical URL kept on the apex of the configured
// primary domain; alternates self-reference because the same URL serves
// RO + EN via cookie-based locale.
// Lane WEB-I18N-EN-PARITY (2026-05-15): all visible strings threaded
// through t(locale, ...) against pricing.* dictionary keys.
const PRIMARY_DOMAIN = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || '';
const PRICING_URL = PRIMARY_DOMAIN
  ? `https://${PRIMARY_DOMAIN}/pricing`
  : 'https://hir-restaurant-web.vercel.app/pricing';

const OG_IMAGE = marketingOgImageUrl({
  title: 'Tarife — 2 lei pe comandă',
  subtitle: 'Fără abonament. Fără procent. Fără setup.',
  variant: 'pricing',
});

export const metadata: Metadata = {
  title: 'Tarife — HIRforYOU',
  description:
    '2 lei pe comandă. Un singur plan. Fără abonament, fără procent, fără setup. Instalare gratuită pentru primele 50 de restaurante.',
  alternates: {
    canonical: PRICING_URL,
    languages: { 'ro-RO': PRICING_URL, en: PRICING_URL, 'x-default': PRICING_URL },
  },
  openGraph: {
    title: 'Tarife — HIRforYOU',
    description:
      'Plătești doar pentru comenzile livrate. 2 lei pe comandă. Fără surprize.',
    type: 'website',
    locale: 'ro_RO',
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Tarife HIR' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tarife — HIRforYOU',
    description: 'Plătești doar pentru comenzile livrate. 2 lei pe comandă.',
    images: [OG_IMAGE],
  },
  robots: { index: true, follow: true },
};

export default function PricingPage() {
  const locale = getLocale();
  const canonicalBase = PRIMARY_DOMAIN
    ? `https://${PRIMARY_DOMAIN}`
    : 'https://hir-restaurant-web.vercel.app';
  const faqLd = pricingFaqJsonLd();
  const productLd = pricingProductJsonLd({ url: PRICING_URL, imageUrl: OG_IMAGE });
  const breadcrumbLd = breadcrumbJsonLd(canonicalBase, [
    { name: 'Acasă', path: '/' },
    { name: 'Tarife', path: '/pricing' },
  ]);

  const compareRows = [
    {
      feature: t(locale, 'pricing.compare_row1_feature'),
      hir: { good: true, label: t(locale, 'pricing.compare_row1_hir') },
      glovo: { good: false, label: t(locale, 'pricing.compare_row1_glovo') },
      wolt: { good: false, label: t(locale, 'pricing.compare_row1_wolt') },
      gloriafood: { good: true, label: t(locale, 'pricing.compare_row1_gf') },
    },
    {
      feature: t(locale, 'pricing.compare_row2_feature'),
      hir: { good: true, label: t(locale, 'pricing.compare_row2_hir') },
      glovo: { good: true, label: t(locale, 'pricing.compare_row2_glovo') },
      wolt: { good: true, label: t(locale, 'pricing.compare_row2_wolt') },
      gloriafood: { good: false, label: t(locale, 'pricing.compare_row2_gf') },
    },
    {
      feature: t(locale, 'pricing.compare_row3_feature'),
      hir: { good: true, label: t(locale, 'pricing.compare_row3_hir') },
      glovo: { good: false, label: t(locale, 'pricing.compare_row3_glovo') },
      wolt: { good: false, label: t(locale, 'pricing.compare_row3_wolt') },
      gloriafood: { good: true, label: t(locale, 'pricing.compare_row3_gf') },
    },
    {
      feature: t(locale, 'pricing.compare_row4_feature'),
      hir: { good: true, label: t(locale, 'pricing.compare_row4_hir') },
      glovo: { good: false, label: t(locale, 'pricing.compare_row4_glovo') },
      wolt: { good: false, label: t(locale, 'pricing.compare_row4_wolt') },
      gloriafood: { good: true, label: t(locale, 'pricing.compare_row4_gf') },
    },
    {
      feature: t(locale, 'pricing.compare_row5_feature'),
      hir: { good: true, label: t(locale, 'pricing.compare_row5_hir') },
      glovo: { good: false, label: t(locale, 'pricing.compare_row5_glovo') },
      wolt: { good: false, label: t(locale, 'pricing.compare_row5_wolt') },
      gloriafood: { good: false, label: t(locale, 'pricing.compare_row5_gf') },
    },
    {
      feature: t(locale, 'pricing.compare_row6_feature'),
      hir: { good: true, label: t(locale, 'pricing.compare_row6_hir') },
      glovo: { good: true, label: t(locale, 'pricing.compare_row6_glovo') },
      wolt: { good: true, label: t(locale, 'pricing.compare_row6_wolt') },
      gloriafood: { good: false, label: t(locale, 'pricing.compare_row6_gf') },
    },
  ];

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(productLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }}
      />
      <MarketingHeader active="/pricing" currentLocale={locale} />

      {/* Hero */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-24">
          <div className="mb-3 inline-flex items-center rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            {t(locale, 'pricing.eyebrow')}
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
            {t(locale, 'pricing.hero_title')}{' '}
            <span className="text-[#4F46E5]">{t(locale, 'pricing.hero_title_price')}</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#475569]">
            {t(locale, 'pricing.hero_body')}
          </p>
        </div>
      </section>

      {/* Pricing card — single tier */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          <PriceCard
            tag={t(locale, 'pricing.card1_tag')}
            title={t(locale, 'pricing.card1_title')}
            price={t(locale, 'pricing.card1_price')}
            priceSub={t(locale, 'pricing.card1_price_sub')}
            description={t(locale, 'pricing.card1_description')}
            badge={t(locale, 'pricing.card1_badge')}
            included={[
              t(locale, 'pricing.card1_p1'),
              t(locale, 'pricing.card1_p2'),
              t(locale, 'pricing.card1_p3'),
              t(locale, 'pricing.card1_p4'),
              t(locale, 'pricing.card1_p5'),
              t(locale, 'pricing.card1_p6'),
              t(locale, 'pricing.card1_p7'),
              t(locale, 'pricing.card1_p8'),
              t(locale, 'pricing.card1_p9'),
              t(locale, 'pricing.card1_p10'),
            ]}
            cta={{ href: '/contact', label: t(locale, 'pricing.card1_cta') }}
            accent
          />
          <div className="flex flex-col justify-center rounded-lg border border-[#E2E8F0] bg-[#FAFAFA] p-7">
            <h3 className="text-lg font-semibold text-[#0F172A]">
              {t(locale, 'pricing.math_title')}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#475569]">
              {t(locale, 'pricing.math_body')}
            </p>
            <dl className="mt-6 space-y-3">
              <div className="flex justify-between border-b border-[#F1F5F9] pb-3 text-sm">
                <dt className="text-[#475569]">{t(locale, 'pricing.math_row1_label')}</dt>
                <dd className="font-semibold text-[#0F172A]">{t(locale, 'pricing.math_row1_value')}</dd>
              </div>
              <div className="flex justify-between border-b border-[#F1F5F9] pb-3 text-sm">
                <dt className="text-[#475569]">{t(locale, 'pricing.math_row2_label')}</dt>
                <dd className="font-semibold text-red-600">{t(locale, 'pricing.math_row2_value')}</dd>
              </div>
              <div className="flex justify-between pb-3 text-sm">
                <dt className="text-[#475569]">{t(locale, 'pricing.math_row3_label')}</dt>
                <dd className="font-semibold text-emerald-700">{t(locale, 'pricing.math_row3_value')}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-[#94A3B8]">{t(locale, 'pricing.math_note')}</p>
          </div>
        </div>

        <p className="mt-8 text-xs text-[#94A3B8]">{t(locale, 'pricing.disclaimer')}</p>
      </section>

      {/* Comparison */}
      <section className="border-y border-[#E2E8F0] bg-white py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight">
            {t(locale, 'pricing.compare_title')}
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-[#475569]">
            {t(locale, 'pricing.compare_body')}
          </p>
          <div className="mt-10 overflow-x-auto rounded-lg border border-[#E2E8F0]">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#FAFAFA]">
                  <th className="px-4 py-3 text-left font-semibold text-[#475569]">
                    {t(locale, 'pricing.compare_col_feature')}
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-[#4F46E5]">HIR</th>
                  <th className="px-4 py-3 text-center font-semibold text-[#475569]">Glovo</th>
                  <th className="px-4 py-3 text-center font-semibold text-[#475569]">Wolt</th>
                  <th className="px-4 py-3 text-center font-semibold text-[#475569]">GloriaFood</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] bg-white">
                {compareRows.map((row) => (
                  <tr key={row.feature}>
                    <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">
                      {row.feature}
                    </td>
                    <Cell {...row.hir} />
                    <Cell {...row.glovo} />
                    <Cell {...row.wolt} />
                    <Cell {...row.gloriafood} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t(locale, 'pricing.faq_title')}
        </h2>
        <div className="mt-8 divide-y divide-[#E2E8F0]">
          <Faq q={t(locale, 'pricing.faq_q1')}>{t(locale, 'pricing.faq_a1')}</Faq>
          <Faq q={t(locale, 'pricing.faq_q2')}>{t(locale, 'pricing.faq_a2')}</Faq>
          <Faq q={t(locale, 'pricing.faq_q3')}>{t(locale, 'pricing.faq_a3')}</Faq>
          <Faq q={t(locale, 'pricing.faq_q4')}>{t(locale, 'pricing.faq_a4')}</Faq>
          <Faq q={t(locale, 'pricing.faq_q5')}>{t(locale, 'pricing.faq_a5')}</Faq>
          <Faq q={t(locale, 'pricing.faq_q6')}>{t(locale, 'pricing.faq_a6')}</Faq>
        </div>
      </section>

      {/* ROI calculator — Lane MARKETING-ROI 2026-05-06 */}
      <RoiCalculator />

      {/* CTA */}
      <section className="border-t border-[#E2E8F0] bg-[#0F172A] text-white">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">
            {t(locale, 'pricing.cta_title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-[#CBD5E1] md:text-base">
            {t(locale, 'pricing.cta_body')}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
            >
              {t(locale, 'pricing.cta_primary')}
            </Link>
            <Link
              href="/migrate-from-gloriafood"
              className="inline-flex items-center justify-center rounded-md border border-white/20 bg-transparent px-5 py-3 text-sm font-medium text-white hover:bg-white/5"
            >
              {t(locale, 'pricing.cta_secondary')}
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter currentLocale={locale} />
    </main>
  );
}

function Cell({ good, label }: { good: boolean; label: string }) {
  return (
    <td className="px-4 py-3 text-center">
      <div
        className={`inline-flex items-center gap-1.5 text-xs font-medium ${
          good ? 'text-emerald-700' : 'text-[#94A3B8]'
        }`}
      >
        {good ? (
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <XCircle className="h-3.5 w-3.5" aria-hidden />
        )}
        {label}
      </div>
    </td>
  );
}

function PriceCard({
  tag,
  title,
  price,
  priceSub,
  description,
  badge,
  included,
  cta,
  accent,
}: {
  tag: string;
  title: string;
  price: string;
  priceSub: string;
  description: string;
  badge?: string;
  included: string[];
  cta: { href: string; label: string };
  accent?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-lg border bg-white p-7 ${
        accent ? 'border-[#C7D2FE] ring-1 ring-[#C7D2FE]' : 'border-[#E2E8F0]'
      }`}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#4F46E5]">
        {tag}
      </div>
      <h3 className="mt-1 text-xl font-semibold text-[#0F172A]">{title}</h3>
      <div
        className={`mt-5 text-4xl font-semibold leading-none tracking-tight ${
          accent ? 'text-[#4F46E5]' : 'text-[#0F172A]'
        }`}
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {price}
      </div>
      <div className="mt-1 text-xs text-[#94A3B8]">{priceSub}</div>
      {badge && (
        <div className="mt-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {badge}
          </span>
        </div>
      )}
      <p className="mt-4 text-sm leading-relaxed text-[#475569]">{description}</p>

      <ul className="mt-6 space-y-2.5 text-sm text-[#475569]">
        {included.map((p) => (
          <li key={p} className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-[#4F46E5]" aria-hidden />
            <span>{p}</span>
          </li>
        ))}
      </ul>

      <div className="mt-7">
        <Link
          href={cta.href}
          className={`inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium ${
            accent
              ? 'bg-[#4F46E5] text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]'
              : 'border border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F8FAFC]'
          }`}
        >
          {cta.label}
        </Link>
      </div>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-[#0F172A]">
        {q}
        <span className="text-[#94A3B8] transition-transform group-open:rotate-45">+</span>
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-[#475569]">{children}</p>
    </details>
  );
}
