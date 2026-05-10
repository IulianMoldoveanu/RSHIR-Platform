import type { Metadata } from 'next';
import { CheckCircle2, XCircle, ChevronDown } from 'lucide-react';
import { t, type TKey } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { LeadForms } from './_components/lead-forms';
import { marketingOgImageUrl } from '@/lib/seo-marketing';

// Deadline: GloriaFood shutdown date
const SHUTDOWN_DATE = new Date('2027-04-30T23:59:59Z');

function daysUntilShutdown(): number {
  const diff = SHUTDOWN_DATE.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  const url = 'https://hiraisolutions.ro/migrate-from-gloriafood';
  const ogImage = marketingOgImageUrl({
    title: t(locale, 'marketing.migrate.og_title'),
    subtitle: t(locale, 'marketing.migrate.page_description'),
    variant: 'migrate',
  });
  return {
    title: t(locale, 'marketing.migrate.page_title'),
    description: t(locale, 'marketing.migrate.page_description'),
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, en: url, 'x-default': url },
    },
    openGraph: {
      title: t(locale, 'marketing.migrate.og_title'),
      description: t(locale, 'marketing.migrate.page_description'),
      url,
      type: 'website',
      locale: locale === 'en' ? 'en_GB' : 'ro_RO',
      images: [{ url: ogImage, width: 1200, height: 630, alt: t(locale, 'marketing.migrate.og_title') }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t(locale, 'marketing.migrate.og_title'),
      description: t(locale, 'marketing.migrate.page_description'),
      images: [ogImage],
    },
  };
}

// ── Comparison table ───────────────────────────────────────────────────────

type CompareRow = {
  feature: TKey;
  hir: TKey;
  gf: TKey;
  agg: TKey;
  hirGood: boolean;
  gfGood: boolean;
  aggGood: boolean;
};

const COMPARE_ROWS: CompareRow[] = [
  {
    feature: 'marketing.migrate.compare_pricing',
    hir: 'marketing.migrate.compare_pricing_hir',
    gf: 'marketing.migrate.compare_pricing_gf',
    agg: 'marketing.migrate.compare_pricing_agg',
    hirGood: true, gfGood: false, aggGood: false,
  },
  {
    feature: 'marketing.migrate.compare_courier',
    hir: 'marketing.migrate.compare_courier_hir',
    gf: 'marketing.migrate.compare_courier_gf',
    agg: 'marketing.migrate.compare_courier_agg',
    hirGood: true, gfGood: false, aggGood: false,
  },
  {
    feature: 'marketing.migrate.compare_ai',
    hir: 'marketing.migrate.compare_ai_hir',
    gf: 'marketing.migrate.compare_ai_gf',
    agg: 'marketing.migrate.compare_ai_agg',
    hirGood: true, gfGood: false, aggGood: false,
  },
  {
    feature: 'marketing.migrate.compare_whitelabel',
    hir: 'marketing.migrate.compare_whitelabel_hir',
    gf: 'marketing.migrate.compare_whitelabel_gf',
    agg: 'marketing.migrate.compare_whitelabel_agg',
    hirGood: true, gfGood: false, aggGood: false,
  },
  {
    feature: 'marketing.migrate.compare_payment',
    hir: 'marketing.migrate.compare_payment_hir',
    gf: 'marketing.migrate.compare_payment_gf',
    agg: 'marketing.migrate.compare_payment_agg',
    hirGood: true, gfGood: false, aggGood: false,
  },
  {
    feature: 'marketing.migrate.compare_support',
    hir: 'marketing.migrate.compare_support_hir',
    gf: 'marketing.migrate.compare_support_gf',
    agg: 'marketing.migrate.compare_support_agg',
    hirGood: true, gfGood: false, aggGood: true,
  },
  {
    feature: 'marketing.migrate.compare_loyalty',
    hir: 'marketing.migrate.compare_loyalty_hir',
    gf: 'marketing.migrate.compare_loyalty_gf',
    agg: 'marketing.migrate.compare_loyalty_agg',
    hirGood: true, gfGood: false, aggGood: false,
  },
  {
    feature: 'marketing.migrate.compare_reservations',
    hir: 'marketing.migrate.compare_reservations_hir',
    gf: 'marketing.migrate.compare_reservations_gf',
    agg: 'marketing.migrate.compare_reservations_agg',
    hirGood: true, gfGood: false, aggGood: false,
  },
  {
    feature: 'marketing.migrate.compare_export',
    hir: 'marketing.migrate.compare_export_hir',
    gf: 'marketing.migrate.compare_export_gf',
    agg: 'marketing.migrate.compare_export_agg',
    hirGood: true, gfGood: false, aggGood: false,
  },
  {
    feature: 'marketing.migrate.compare_migration',
    hir: 'marketing.migrate.compare_migration_hir',
    gf: 'marketing.migrate.compare_migration_gf',
    agg: 'marketing.migrate.compare_migration_agg',
    hirGood: true, gfGood: false, aggGood: false,
  },
];

// ── FAQ data ───────────────────────────────────────────────────────────────

type FaqItem = { q: TKey; a: TKey };

const FAQ_ITEMS: FaqItem[] = [
  { q: 'marketing.migrate.faq_q1', a: 'marketing.migrate.faq_a1' },
  { q: 'marketing.migrate.faq_q2', a: 'marketing.migrate.faq_a2' },
  { q: 'marketing.migrate.faq_q3', a: 'marketing.migrate.faq_a3' },
  { q: 'marketing.migrate.faq_q4', a: 'marketing.migrate.faq_a4' },
];

// ── Restaurant bullets ─────────────────────────────────────────────────────

const REST_BULLETS: TKey[] = [
  'marketing.migrate.for_restaurants_bullet_1',
  'marketing.migrate.for_restaurants_bullet_2',
  'marketing.migrate.for_restaurants_bullet_3',
];

const RESELLER_BULLETS: TKey[] = [
  'marketing.migrate.for_resellers_bullet_1',
  'marketing.migrate.for_resellers_bullet_2',
  'marketing.migrate.for_resellers_bullet_3',
];

// ── Cell helper ────────────────────────────────────────────────────────────

function Cell({ good, label }: { good: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center gap-1 text-xs font-medium ${
        good ? 'text-emerald-700' : 'text-red-600'
      }`}
    >
      {good ? (
        <CheckCircle2 className="h-4 w-4" aria-hidden />
      ) : (
        <XCircle className="h-4 w-4" aria-hidden />
      )}
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function MigrateFromGloriaFoodPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const locale = getLocale();
  const refCode = typeof searchParams.ref === 'string' ? searchParams.ref : '';
  const days = daysUntilShutdown();

  return (
    <div className="min-h-screen bg-white text-zinc-900">

      {/* ── Nav bar ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-zinc-100 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="text-base font-bold tracking-tight text-violet-700">HIRforYOU</span>
          <a
            href="#forms"
            className="rounded-full bg-violet-700 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-violet-800"
          >
            {t(locale, 'marketing.migrate.cta_migrate')}
          </a>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-violet-700 via-violet-800 to-violet-900 px-4 py-16 text-white sm:py-24">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-violet-500/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />

        <div className="relative mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-red-500/90 px-4 py-1.5 text-sm font-semibold text-white shadow-lg">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden />
            {t(locale, 'marketing.migrate.days_remaining_template', { days })}
          </div>

          <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            {t(locale, 'marketing.migrate.hero_heading')}
            <br />
            <span className="text-emerald-300">{t(locale, 'marketing.migrate.hero_subheading')}</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base text-violet-100 sm:text-lg">
            {t(locale, 'marketing.migrate.hero_body')}
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href="#forms"
              className="w-full rounded-full bg-emerald-400 px-7 py-3 text-base font-bold text-emerald-950 shadow-lg transition-colors hover:bg-emerald-300 sm:w-auto"
            >
              {t(locale, 'marketing.migrate.cta_migrate')}
            </a>
            <a
              href="#reseller"
              className="w-full rounded-full border-2 border-white/60 px-7 py-3 text-base font-semibold text-white transition-colors hover:border-white hover:bg-white/10 sm:w-auto"
            >
              {t(locale, 'marketing.migrate.cta_reseller')}
            </a>
          </div>

          {/* Lane SITE-COPY-V2 (2026-05-10) — surface "implementare gratuită" promo. */}
          <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-2 rounded-full bg-emerald-500/95 px-4 py-2 text-sm font-bold text-white shadow-lg">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            <span>Migrare GRATUITĂ + IMPLEMENTARE GRATUITĂ — primele 50 restaurante</span>
          </div>
        </div>
      </section>

      {/* ── For restaurants ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="mb-8 text-center text-2xl font-bold tracking-tight sm:text-3xl">
          {t(locale, 'marketing.migrate.for_restaurants_title')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {REST_BULLETS.map((key) => (
            <div key={key} className="flex gap-3 rounded-2xl border border-violet-100 bg-violet-50 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-violet-600" aria-hidden />
              <p className="text-sm font-medium text-violet-900">{t(locale, key)}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <a
            href="#forms"
            className="inline-block rounded-full bg-violet-700 px-8 py-3 text-base font-semibold text-white shadow transition-colors hover:bg-violet-800"
          >
            {t(locale, 'marketing.migrate.for_restaurants_cta')}
          </a>
        </div>
      </section>

      {/* ── Comparison table ──────────────────────────────────────────── */}
      <section className="bg-zinc-50 px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-center text-2xl font-bold tracking-tight sm:text-3xl">
            {t(locale, 'marketing.migrate.compare_title')}
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-4 py-3 text-left font-semibold text-zinc-700">
                    {t(locale, 'marketing.migrate.compare_feature')}
                  </th>
                  <th className="px-4 py-3 text-center font-bold text-violet-700">
                    {t(locale, 'marketing.migrate.compare_hir')}
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-zinc-500">
                    {t(locale, 'marketing.migrate.compare_gloriafood')}
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-zinc-500">
                    {t(locale, 'marketing.migrate.compare_aggregators')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.feature} className="hover:bg-zinc-50/60">
                    <td className="px-4 py-3 font-medium text-zinc-700">
                      {t(locale, row.feature)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Cell good={row.hirGood} label={t(locale, row.hir)} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Cell good={row.gfGood} label={t(locale, row.gf)} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Cell good={row.aggGood} label={t(locale, row.agg)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── For resellers ─────────────────────────────────────────────── */}
      <section id="reseller" className="mx-auto max-w-5xl px-4 py-16">
        <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-emerald-100 p-8 sm:p-12">
          <h2 className="mb-2 text-2xl font-bold tracking-tight text-emerald-900 sm:text-3xl">
            {t(locale, 'marketing.migrate.for_resellers_title')}
          </h2>
          <p className="mb-6 text-sm text-emerald-800">
            {t(locale, 'marketing.migrate.for_resellers_intro')}
          </p>
          <div className="mb-8 flex flex-col gap-3">
            {RESELLER_BULLETS.map((key) => (
              <div key={key} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" aria-hidden />
                <p className="text-sm font-medium text-emerald-900">{t(locale, key)}</p>
              </div>
            ))}
          </div>
          <a
            href="#forms"
            className="inline-block rounded-full bg-emerald-600 px-8 py-3 text-base font-semibold text-white shadow transition-colors hover:bg-emerald-700"
          >
            {t(locale, 'marketing.migrate.for_resellers_cta')}
          </a>
        </div>
      </section>

      {/* ── Lead forms ────────────────────────────────────────────────── */}
      <section id="forms" className="bg-zinc-50 px-4 py-16">
        <div className="mx-auto max-w-lg">
          <LeadForms locale={locale} refCode={refCode} />
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="mb-8 text-center text-2xl font-bold tracking-tight sm:text-3xl">
          {t(locale, 'marketing.migrate.faq_title')}
        </h2>
        <div className="flex flex-col divide-y divide-zinc-200">
          {FAQ_ITEMS.map(({ q, a }) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-zinc-800">
                {t(locale, q)}
                <ChevronDown
                  className="h-5 w-5 flex-shrink-0 text-zinc-500 transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                {t(locale, a)}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-xs text-zinc-500">
        <p className="font-medium text-zinc-700">
          {t(locale, 'marketing.migrate.footer_legal')}
        </p>
        <div className="mt-2 flex items-center justify-center gap-4">
          <a href="/privacy" className="underline hover:text-zinc-700">
            {t(locale, 'marketing.migrate.footer_gdpr')}
          </a>
          <a href="mailto:office@hirforyou.ro" className="underline hover:text-zinc-700">
            {t(locale, 'marketing.migrate.footer_contact')}
          </a>
        </div>
      </footer>
    </div>
  );
}
