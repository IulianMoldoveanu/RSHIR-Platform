// Brand marketing landing — rendered at `/` on the canonical Vercel host
// when no tenant is resolved. NOT shown on tenant subdomains or custom
// domains (those resolve to the storefront menu).
//
// Lane EN-I18N (2026-05-05) — body copy threaded through `t()` against
// the `marketing.home.*` dictionary keys shipped in PR A. Layout / brand
// tokens unchanged; only the JSX literals were lifted into the dictionary
// so RO ↔ EN cookie flips re-render the page in the chosen language.

import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { t, type Locale } from '@/lib/i18n';
import { MarketingHeader, MarketingFooter } from './marketing-shell';
import { HeroPhoneMockup } from './hero-phone-mockup';
import { HowItWorks } from './how-it-works';
import { ClientLogos } from './client-logos';

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
          {/* Hero badge "GloriaFood se închide..." hidden 2026-06-02 per Iulian
              directive — keep link in nav (/migrate-from-gloriafood) only, not as
              a prominent homepage banner. The dictionary key marketing.home.hero_badge
              remains so this can be restored by adding back the div. */}
          <div className="grid items-center gap-12 md:grid-cols-[1.1fr_0.9fr]">
            <div>
              <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
                {t(currentLocale, 'marketing.home.hero_title_pre')}{' '}
                <span className="text-[#4F46E5]">
                  {t(currentLocale, 'marketing.home.hero_title_price')}
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-[#475569] md:text-lg">
                {t(currentLocale, 'marketing.home.hero_body')}
              </p>
              {/* 2026-08-01 — single hero CTA pointing at the interactive demo.
                  The old secondary "Încep singur — fără card" button was removed
                  per Iulian; /migrate-from-gloriafood keeps its own page and
                  sitemap entry, it's just no longer promoted here. */}
              <div className="mt-9">
                <Link
                  href="/demo-storefront"
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#4F46E5] px-6 py-3.5 text-base font-medium text-white shadow-md shadow-[#4F46E5]/25 ring-1 ring-inset ring-[#4338CA] transition-all hover:bg-[#4338CA] hover:shadow-lg hover:shadow-[#4F46E5]/30 active:translate-y-px focus-visible:outline-2 focus-visible:outline-[#4F46E5] focus-visible:outline-offset-2"
                >
                  {t(currentLocale, 'marketing.home.cta_signup')}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>

              {/* Trust strip */}
              <dl className="mt-14 grid gap-6 border-t border-[#F1F5F9] pt-8 sm:grid-cols-2">
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
              </dl>
            </div>

            <HeroPhoneMockup currentLocale={currentLocale} />
          </div>
        </div>
      </section>

      <ClientLogos currentLocale={currentLocale} />

      {/* ── How it works ───────────────────────────────────────────────── */}
      {/* 2026-08-01 — replaces the four-column value-props grid. Keys
          value_storefront_* / value_courier_* / value_importer_* / value_data_*
          are now inert but kept, same convention as hero_badge. */}
      <HowItWorks currentLocale={currentLocale} />

      {/* Aggregator-transparency visual section removed 2026-06-10 per Iulian directive
          ("glovo wolt toate intr-un singur ecran — elimina, nu imi place"). The
          Glovo/Wolt/Bolt 3-terminal vs HIR-single-ecran comparison felt visually
          heavy and the anti-aggregator positioning is already woven into pricing
          comparison + value props. Dictionary keys aggregator_title/body/sub
          remain (used elsewhere or kept for future polish). */}

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
                  ? 'Vezi oferta de abonament →'
                  : 'See the subscription offer →'}
              </Link>
              <p className="mt-3 text-sm leading-relaxed text-[#475569]">
                {currentLocale === 'ro'
                  ? 'Cu volum mare de comenzi, un abonament fix devine semnificativ mai avantajos decât comisionul procentual reținut de Glovo/Wolt/Bolt.'
                  : 'With high order volume, a fixed subscription becomes significantly more advantageous than the percentage commission taken by Glovo/Wolt/Bolt.'}
              </p>
            </div>
          </div>
          <p className="mt-6 text-xs text-[#94A3B8]">
            {t(currentLocale, 'marketing.home.pricing_disclaimer')}
          </p>
        </div>
      </section>

      {/* HIR Connect teaser removed 2026-08-01 per Iulian ("exclude hir
          connect ... simplu aerisit"). It was the densest block on the page —
          two columns, a checklist and a comparison table — and pulled directly
          against the "extremely simple" goal. /connect still resolves at its
          own URL with its own sitemap entry; the connect_* dictionary keys are
          kept inert so the section can be restored wholesale if needed. */}

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
            {/* 2026-08-01 — was /migrate-from-gloriafood; retargeted to the
                demo so both homepage CTAs point somewhere a prospect can act
                on immediately. final_cta_consultant is now inert. */}
            <Link
              href="/demo-storefront"
              className="inline-flex items-center justify-center rounded-md border border-white/20 bg-transparent px-5 py-3 text-sm font-medium text-white hover:bg-white/5"
            >
              {t(currentLocale, 'marketing.home.cta_signup')}
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

