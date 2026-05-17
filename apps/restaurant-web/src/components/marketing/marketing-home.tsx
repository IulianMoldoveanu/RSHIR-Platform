// Brand marketing landing — rendered at `/` on the canonical Vercel host
// when no tenant is resolved. NOT shown on tenant subdomains or custom
// domains (those resolve to the storefront menu).
//
// Lane EN-I18N (2026-05-05) — body copy threaded through `t()` against
// the `marketing.home.*` dictionary keys shipped in PR A. Layout / brand
// tokens unchanged; only the JSX literals were lifted into the dictionary
// so RO ↔ EN cookie flips re-render the page in the chosen language.

import Link from 'next/link';
import {
  CheckCircle2,
  Truck,
  ChefHat,
  Zap,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Monitor,
} from 'lucide-react';
import { t, type Locale } from '@/lib/i18n';
import { MarketingHeader, MarketingFooter } from './marketing-shell';

export function MarketingHome({ currentLocale }: { currentLocale: Locale }) {
  return (
    <main
      id="main-content"
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <MarketingHeader active="/" currentLocale={currentLocale} />

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
          {/* Mobile-fix 2026-05-05: was `inline-flex` with single-line label.
              On 360px the full Romanian label overflowed the viewport. Switch
              to a regular flex pill that wraps the label across two lines and
              keeps the icon on the first row by pinning it `flex-none`. */}
          <div className="mb-4 flex max-w-full items-start gap-2 self-start rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE] sm:inline-flex sm:items-center">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-none sm:mt-0" aria-hidden />
            <span>{t(currentLocale, 'marketing.home.hero_badge')}</span>
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            {t(currentLocale, 'marketing.home.hero_title_pre')}{' '}
            <span className="text-[#4F46E5]">
              {t(currentLocale, 'marketing.home.hero_title_price')}
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[#475569] md:text-lg">
            {t(currentLocale, 'marketing.home.hero_body')}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white shadow-md shadow-[#4F46E5]/25 ring-1 ring-inset ring-[#4338CA] transition-all hover:bg-[#4338CA] hover:shadow-lg hover:shadow-[#4F46E5]/30 active:translate-y-px focus-visible:outline-2 focus-visible:outline-[#4F46E5] focus-visible:outline-offset-2"
            >
              {t(currentLocale, 'marketing.home.cta_signup')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/migrate-from-gloriafood"
              className="inline-flex items-center justify-center rounded-md border border-[#E2E8F0] bg-white px-5 py-3 text-sm font-medium text-[#0F172A] transition-colors hover:border-[#CBD5E1] hover:bg-[#F8FAFC] focus-visible:outline-2 focus-visible:outline-[#4F46E5] focus-visible:outline-offset-2"
            >
              {t(currentLocale, 'marketing.home.cta_partner')}
            </Link>
            <Link
              href="/case-studies/foisorul-a"
              className="inline-flex items-center justify-center rounded-md px-5 py-3 text-sm font-medium text-[#475569] hover:text-[#0F172A]"
            >
              {t(currentLocale, 'marketing.home.cta_case_study')}
            </Link>
          </div>

          {/* Trust strip */}
          <dl className="mt-14 grid gap-6 border-t border-[#F1F5F9] pt-8 sm:grid-cols-3">
            <Stat
              label={t(currentLocale, 'marketing.home.stat_pricing_label')}
              value={t(currentLocale, 'marketing.home.stat_pricing_value')}
              sub={t(currentLocale, 'marketing.home.stat_pricing_sub')}
            />
            <Stat
              label={t(currentLocale, 'marketing.home.stat_importer_label')}
              value={t(currentLocale, 'marketing.home.stat_importer_value')}
              sub={t(currentLocale, 'marketing.home.stat_importer_sub')}
            />
            <Stat
              label={t(currentLocale, 'marketing.home.stat_pilot_label')}
              value={t(currentLocale, 'marketing.home.stat_pilot_value')}
              sub={t(currentLocale, 'marketing.home.stat_pilot_sub')}
            />
          </dl>
        </div>
      </section>

      {/* ── Value props ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="max-w-2xl text-2xl font-semibold tracking-tight md:text-3xl">
          {t(currentLocale, 'marketing.home.value_section_title')}
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-[#475569]">
          {t(currentLocale, 'marketing.home.value_section_intro')}
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <Feature
            icon={<ChefHat className="h-5 w-5" />}
            title={t(currentLocale, 'marketing.home.value_storefront_title')}
            body={t(currentLocale, 'marketing.home.value_storefront_body')}
          />
          <Feature
            icon={<Truck className="h-5 w-5" />}
            title={t(currentLocale, 'marketing.home.value_courier_title')}
            body={t(currentLocale, 'marketing.home.value_courier_body')}
          />
          <Feature
            icon={<Zap className="h-5 w-5" />}
            title={t(currentLocale, 'marketing.home.value_importer_title')}
            body={t(currentLocale, 'marketing.home.value_importer_body')}
          />
          <Feature
            icon={<ShieldCheck className="h-5 w-5" />}
            title={t(currentLocale, 'marketing.home.value_data_title')}
            body={t(currentLocale, 'marketing.home.value_data_body')}
          />
        </div>
        <div className="mt-8">
          <Link
            href="/features"
            className="group inline-flex items-center gap-1 rounded-md text-sm font-medium text-[#4F46E5] transition-colors hover:text-[#4338CA] focus-visible:outline-2 focus-visible:outline-[#4F46E5] focus-visible:outline-offset-2"
          >
            {t(currentLocale, 'marketing.home.value_more_link')}
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </div>
      </section>

      {/* ── Aggregator transparency ────────────────────────────────────── */}
      <section className="border-y border-[#E2E8F0] bg-[#0F172A] text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                {t(currentLocale, 'marketing.home.aggregator_title')}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-[#CBD5E1]">
                {t(currentLocale, 'marketing.home.aggregator_body')}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-[#94A3B8]">
                {t(currentLocale, 'marketing.home.aggregator_sub')}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(['Glovo', 'Wolt', 'Bolt'] as const).map((app) => (
                <div
                  key={app}
                  className="flex flex-col items-center justify-center rounded-lg border border-white/10 bg-white/5 p-4 text-center"
                >
                  <Monitor className="mb-2 h-6 w-6 text-[#94A3B8]" aria-hidden />
                  <span className="text-xs font-medium text-[#94A3B8]">{app}</span>
                  <span className="mt-1 text-[10px] text-[#64748B]">terminal separat</span>
                </div>
              ))}
              <div className="col-span-3 flex items-center justify-center rounded-lg border border-[#4F46E5]/40 bg-[#4F46E5]/10 p-4">
                <span className="text-sm font-semibold text-[#C7D2FE]">
                  HIR — un singur ecran
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ─────────────────────────────────────────────── */}
      <section className="border-y border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight md:text-3xl">
            {t(currentLocale, 'marketing.home.pricing_title')}
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-[#475569]">
            {t(currentLocale, 'marketing.home.pricing_intro')}
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <PriceCard
              tag={t(currentLocale, 'marketing.home.pricing_card1_tag')}
              title={t(currentLocale, 'marketing.home.pricing_card1_title')}
              price={t(currentLocale, 'marketing.home.pricing_card1_price')}
              priceSub={t(currentLocale, 'marketing.home.pricing_card1_price_sub')}
              points={[
                t(currentLocale, 'marketing.home.pricing_card1_p1'),
                t(currentLocale, 'marketing.home.pricing_card1_p2'),
                t(currentLocale, 'marketing.home.pricing_card1_p3'),
                t(currentLocale, 'marketing.home.pricing_card1_p4'),
                t(currentLocale, 'marketing.home.pricing_card1_p5'),
              ]}
              cta={{
                href: '/contact',
                label: t(currentLocale, 'marketing.home.pricing_card1_cta'),
              }}
              accent
            />
            <div className="flex flex-col justify-center rounded-lg border border-[#E2E8F0] bg-[#FAFAFA] p-6">
              <Link
                href="/pricing"
                className="text-sm font-medium text-[#4F46E5] hover:text-[#4338CA]"
              >
                {currentLocale === 'ro'
                  ? 'Calculează economia lunară →'
                  : 'Calculate your monthly savings →'}
              </Link>
              <p className="mt-3 text-sm leading-relaxed text-[#475569]">
                {currentLocale === 'ro'
                  ? 'Restaurantele cu 30 comenzi/zi × 80 lei bon mediu economisesc ~540 RON/zi față de Glovo. Calculator interactiv pe pagina de tarife.'
                  : 'Restaurants with 30 orders/day × 80 lei average order save ~540 RON/day vs Glovo. Interactive calculator on the pricing page.'}
              </p>
            </div>
          </div>
          <p className="mt-6 text-xs text-[#94A3B8]">
            {t(currentLocale, 'marketing.home.pricing_disclaimer')}
          </p>
        </div>
      </section>

      {/* ── Case study tile ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-8 rounded-lg border border-[#E2E8F0] bg-white p-8 md:grid-cols-2 md:p-12">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[#4F46E5]">
              {t(currentLocale, 'marketing.home.case_study_eyebrow')}
            </div>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight">
              {t(currentLocale, 'marketing.home.case_study_title')}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#475569]">
              {t(currentLocale, 'marketing.home.case_study_body')}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Tag>{t(currentLocale, 'marketing.home.case_study_tag1')}</Tag>
              <Tag>{t(currentLocale, 'marketing.home.case_study_tag2')}</Tag>
              <Tag>{t(currentLocale, 'marketing.home.case_study_tag3')}</Tag>
              <Tag>{t(currentLocale, 'marketing.home.case_study_tag4')}</Tag>
            </div>
            <Link
              href="/case-studies/foisorul-a"
              className="group mt-7 inline-flex items-center gap-1 rounded-md text-sm font-medium text-[#4F46E5] transition-colors hover:text-[#4338CA] focus-visible:outline-2 focus-visible:outline-[#4F46E5] focus-visible:outline-offset-2"
            >
              {t(currentLocale, 'marketing.home.case_study_link')}
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </div>
          <div className="rounded-md border border-[#F1F5F9] bg-[#FAFAFA] p-6">
            <div className="text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
              {t(currentLocale, 'marketing.home.case_study_results_title')}
            </div>
            <dl className="mt-4 space-y-4">
              <ResultRow
                label={t(currentLocale, 'marketing.home.case_study_result1_label')}
                value={t(currentLocale, 'marketing.home.case_study_result1_value')}
              />
              <ResultRow
                label={t(currentLocale, 'marketing.home.case_study_result2_label')}
                value={t(currentLocale, 'marketing.home.case_study_result2_value')}
              />
              <ResultRow
                label={t(currentLocale, 'marketing.home.case_study_result3_label')}
                value={t(currentLocale, 'marketing.home.case_study_result3_value')}
              />
              <ResultRow
                label={t(currentLocale, 'marketing.home.case_study_result4_label')}
                value={t(currentLocale, 'marketing.home.case_study_result4_value')}
              />
            </dl>
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section className="border-t border-[#E2E8F0] bg-[#0F172A] text-white">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">
            {t(currentLocale, 'marketing.home.final_cta_title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-[#CBD5E1] md:text-base">
            {t(currentLocale, 'marketing.home.final_cta_body')}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white shadow-md shadow-[#4F46E5]/25 ring-1 ring-inset ring-[#4338CA] transition-all hover:bg-[#4338CA] hover:shadow-lg hover:shadow-[#4F46E5]/30 active:translate-y-px focus-visible:outline-2 focus-visible:outline-[#4F46E5] focus-visible:outline-offset-2"
            >
              {t(currentLocale, 'marketing.home.final_cta_signup')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/migrate-from-gloriafood"
              className="inline-flex items-center justify-center rounded-md border border-white/20 bg-transparent px-5 py-3 text-sm font-medium text-white hover:bg-white/5"
            >
              {t(currentLocale, 'marketing.home.final_cta_consultant')}
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter currentLocale={currentLocale} />
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-[#94A3B8]">{label}</dt>
      <dd
        className="mt-2 text-3xl font-semibold tracking-tight text-[#0F172A]"
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {value}
      </dd>
      {sub && <dd className="mt-1 text-xs text-[#475569]">{sub}</dd>}
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-5">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[#EEF2FF] text-[#4F46E5]">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-[#0F172A]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#475569]">{body}</p>
    </div>
  );
}

function PriceCard({
  tag,
  title,
  price,
  priceSub,
  points,
  cta,
  accent,
}: {
  tag: string;
  title: string;
  price: string;
  priceSub: string;
  points: string[];
  cta: { href: string; label: string };
  accent?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-lg border bg-white p-6 ${
        accent ? 'border-[#C7D2FE] ring-1 ring-[#C7D2FE]' : 'border-[#E2E8F0]'
      }`}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#4F46E5]">{tag}</div>
      <h3 className="mt-1 text-lg font-semibold text-[#0F172A]">{title}</h3>
      <div
        className={`mt-4 text-4xl font-semibold leading-none tracking-tight ${
          accent ? 'text-[#4F46E5]' : 'text-[#0F172A]'
        }`}
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {price}
      </div>
      <div className="mt-1 text-xs text-[#94A3B8]">{priceSub}</div>
      <ul className="mt-6 space-y-2.5 text-sm text-[#475569]">
        {points.map((p) => (
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

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-[#EEF2FF] px-2 py-0.5 text-xs font-medium text-[#4338CA]">
      {children}
    </span>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[#F1F5F9] pb-3 last:border-0 last:pb-0">
      <dt className="text-xs text-[#475569]">{label}</dt>
      <dd
        className="text-sm font-semibold text-[#0F172A]"
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {value}
      </dd>
    </div>
  );
}
