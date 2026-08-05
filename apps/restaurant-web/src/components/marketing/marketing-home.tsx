// Brand marketing landing — rendered at `/` on the canonical Vercel host
// when no tenant is resolved. NOT shown on tenant subdomains or custom
// domains (those resolve to the storefront menu).
//
// Lane EN-I18N (2026-05-05) — body copy threaded through `t()` against
// the `marketing.home.*` dictionary keys shipped in PR A. Layout / brand
// tokens unchanged; only the JSX literals were lifted into the dictionary
// so RO ↔ EN cookie flips re-render the page in the chosen language.

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { t, type Locale } from '@/lib/i18n';
import { MarketingHeader, MarketingFooter } from './marketing-shell';
import { HeroShowcase } from './hero-showcase';
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
      {/* 2026-08-02 — no headline, no body copy, no stat strip. Iulian:
          "exclude si scrisul cu afacerea ta. clientii tai etc. prima pagina sa
          fie direct cu poza cu animatie pe telefon si in spate cum arata pe
          desktop." The <h1> stays in the DOM but screen-reader-only: a page
          with no h1 is an accessibility and SEO regression, and the title is
          what Google reads even when nothing is drawn on screen. The
          hero_title_*, hero_body and stat_* dictionary keys are now inert,
          same convention as hero_badge. */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <h1 className="sr-only">{t(currentLocale, 'marketing.home.page_title')}</h1>

          <HeroShowcase currentLocale={currentLocale} />

          <div className="mt-12 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
            <Link
              href="/demo-storefront"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#4F46E5] px-6 py-3.5 text-base font-medium text-white shadow-md shadow-[#4F46E5]/25 ring-1 ring-inset ring-[#4338CA] transition-all hover:bg-[#4338CA] hover:shadow-lg hover:shadow-[#4F46E5]/30 active:translate-y-px focus-visible:outline-2 focus-visible:outline-[#4F46E5] focus-visible:outline-offset-2"
            >
              {t(currentLocale, 'marketing.home.cta_signup')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/cum-functioneaza"
              className="inline-flex items-center justify-center rounded-md border border-[#CBD5E1] bg-white px-6 py-3.5 text-base font-medium text-[#0F172A] transition-colors hover:bg-[#F8FAFC] focus-visible:outline-2 focus-visible:outline-[#4F46E5] focus-visible:outline-offset-2"
            >
              {t(currentLocale, 'marketing.shell.nav_how')}
            </Link>
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

      {/* Pricing teaser removed 2026-08-01 per Iulian ("prima pagina are mult
          prea mult scris ... asta cu abonament lunar ... nu incerc sa
          convertesc din site. in site trebuie doar sa vada cum functioneaza").
          /pricing itself is retired (301 to `/`, see next.config.mjs) — the
          site no longer pitches a subscription anywhere, homepage included.
          The pricing_* dictionary keys this section used were deleted
          alongside it, not kept inert — the whole pricing framing contradicts
          the site's new job, so there's nothing here to ever restore. */}

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
