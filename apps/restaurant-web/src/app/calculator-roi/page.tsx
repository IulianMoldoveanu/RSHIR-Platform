import type { Metadata } from 'next';
import { MarketingHeader, MarketingFooter } from '@/components/marketing/marketing-shell';
import { getLocale } from '@/lib/i18n/server';
import { marketingOgImageUrl, breadcrumbJsonLd, PRIMARY_DOMAIN } from '@/lib/seo-marketing';
import { safeJsonLd } from '@/lib/jsonld';
import CalculatorClient from './calculator-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CANONICAL_URL = `https://${PRIMARY_DOMAIN}/calculator-roi`;

const OG_IMAGE = marketingOgImageUrl({
  title: 'Calculator ROI restaurant — HIR vs Glovo',
  subtitle: 'Plătești 2 lei/comandă, nu 30%. Calculează LIVE cât rămâne la tine.',
  variant: 'pricing',
});

export const metadata: Metadata = {
  title: 'Calculator ROI restaurant — HIR vs Glovo | HIRforYOU',
  description:
    'Vezi în 30 de secunde câți bani îți rămân la tine cu HIR față de Glovo. Plătești 2 lei pe comandă, nu 30% comision. Calculez LIVE cu sliderul tău.',
  alternates: {
    canonical: CANONICAL_URL,
    languages: {
      'ro-RO': CANONICAL_URL,
      'x-default': CANONICAL_URL,
    },
  },
  openGraph: {
    title: 'Calculator ROI restaurant — HIR vs Glovo',
    description:
      'Plătești 2 lei/comandă, nu 30%. Calculează LIVE câți bani recuperezi lunar față de Glovo/Wolt.',
    type: 'website',
    locale: 'ro_RO',
    url: CANONICAL_URL,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Calculator ROI HIR vs Glovo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Calculator ROI restaurant — HIR vs Glovo',
    description: 'Plătești 2 lei/comandă, nu 30%. Calculează LIVE cât rămâne la tine.',
    images: [OG_IMAGE],
  },
  robots: { index: true, follow: true },
};

export default function CalculatorRoiPage() {
  const locale = getLocale();

  const breadcrumbLd = breadcrumbJsonLd(`https://${PRIMARY_DOMAIN}`, [
    { name: 'Acasă', path: '/' },
    { name: 'Calculator ROI', path: '/calculator-roi' },
  ]);

  return (
    <main
      id="main-content"
      className="min-h-screen bg-slate-50 text-slate-900"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }}
      />
      <MarketingHeader active="/calculator-roi" currentLocale={locale} />

      {/* Hero */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 sm:py-20">
          <div className="mb-3 inline-flex items-center rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 ring-1 ring-inset ring-red-200">
            Glovo ia 30% din fiecare comandă
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Calculează cât economisești{' '}
            <span className="text-indigo-600">cu HIR</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-500 sm:text-lg">
            Mută cursorul. Vezi <strong className="text-slate-800">LIVE</strong> cât rămâne la
            tine.
          </p>
        </div>
      </section>

      {/* Calculator */}
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <CalculatorClient />
      </section>

      <MarketingFooter currentLocale={locale} />
    </main>
  );
}
