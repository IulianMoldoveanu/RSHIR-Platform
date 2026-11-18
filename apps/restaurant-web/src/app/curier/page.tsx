// /curier — the page you send someone so they know what HIR Curier is before
// they buy it. Asked for 2026-11-18: "nu avem pagina de prezentare pentru
// aplicatia de curierat ... daca vreau sa trimit pe cineva pe un link de
// prezentare sa stie omul ce cumpara ... distincta de sistemul de comenzi
// online. ele pot fi complementare fara probleme. dar si individuale."
//
// So the page has to say two things at once: here is what the courier app
// does, and no, you do not have to take the ordering system with it. That is
// the `hero_note` line, and it is why the page stands apart from
// /cum-functioneaza rather than being a seventh step inside it.
//
// Same shell, type scale and colours as /cum-functioneaza so the two read as
// one site. Screenshots are real captures from the live app on a phone
// viewport (see apps/restaurant-courier/scripts/capture-presentation-shots.mjs)
// — the house rule since 2026-08-01 is real screenshots only; hand-drawn CSS
// mockups were tried once and read as loading skeletons.
//
// Not in the header nav: that was deliberately cut to four entries, and this
// page exists to be sent as a link. It is in the sitemap so it is findable.

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { MarketingHeader, MarketingFooter } from '@/components/marketing/marketing-shell';
import { GuideShot } from '@/components/marketing/guide-shot';
import { t, type TKey } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { canonicalBaseUrl, marketingOgImageUrl } from '@/lib/seo-marketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const title = t(locale, 'marketing.courier.page_title');
  const description = t(locale, 'marketing.courier.page_description');
  const ogImage = marketingOgImageUrl({ title, subtitle: description });
  const h = await headers();
  const host = h.get('x-hir-host') ?? h.get('host')?.split(':')[0] ?? '';
  const url = `${canonicalBaseUrl(host)}/curier`;
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

// Six things it does, one line each. Listed literally rather than built from
// a loop index so a typo is a compile error, not a blank line in production.
const FEATURES: ReadonlyArray<{ titleKey: TKey; bodyKey: TKey }> = [
  { titleKey: 'marketing.courier.f1_title', bodyKey: 'marketing.courier.f1_body' },
  { titleKey: 'marketing.courier.f2_title', bodyKey: 'marketing.courier.f2_body' },
  { titleKey: 'marketing.courier.f3_title', bodyKey: 'marketing.courier.f3_body' },
  { titleKey: 'marketing.courier.f4_title', bodyKey: 'marketing.courier.f4_body' },
  { titleKey: 'marketing.courier.f5_title', bodyKey: 'marketing.courier.f5_body' },
  { titleKey: 'marketing.courier.f6_title', bodyKey: 'marketing.courier.f6_body' },
];

const AUDIENCES: ReadonlyArray<{ titleKey: TKey; bodyKey: TKey }> = [
  { titleKey: 'marketing.courier.who1_title', bodyKey: 'marketing.courier.who1_body' },
  { titleKey: 'marketing.courier.who2_title', bodyKey: 'marketing.courier.who2_body' },
];

export default async function CourierPage() {
  const locale = await getLocale();

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <MarketingHeader currentLocale={locale} />

      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <h1 className="max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            {t(locale, 'marketing.courier.hero_title')}
          </h1>
          <p className="mt-4 max-w-xl text-base text-[#475569]">
            {t(locale, 'marketing.courier.hero_intro')}
          </p>
          {/* The whole reason this page is separate: it is not an add-on to
              the ordering system, and the person reading needs to know that
              before anything else. */}
          <p className="mt-6 max-w-xl rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm leading-relaxed text-[#475569]">
            {t(locale, 'marketing.courier.hero_note')}
          </p>
        </div>
      </section>

      {/* The one screenshot that carries the page: a real courier home screen
          over central Bucharest, with the swipe that starts a shift. */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
          <div className="order-2 md:order-1">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {t(locale, 'marketing.courier.what_title')}
            </h2>
            <ul className="mt-6 flex flex-col gap-5">
              {FEATURES.map((f) => (
                <li key={f.titleKey}>
                  <h3 className="text-base font-semibold">{t(locale, f.titleKey)}</h3>
                  <p className="mt-1 max-w-md text-sm leading-relaxed text-[#475569]">
                    {t(locale, f.bodyKey)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <figure className="order-1 md:order-2">
            <GuideShot
              src="/guide/courier-app-home.webp"
              alt={t(locale, 'marketing.courier.shot1_caption')}
              width={460}
              height={1022}
              frame="phone"
              priority
            />
            <figcaption className="mt-4 text-center text-xs text-[#64748B]">
              {t(locale, 'marketing.courier.shot1_caption')}
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="border-y border-[#E2E8F0] bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 md:gap-14 md:py-16">
          <figure>
            <GuideShot
              src="/guide/courier-app-earnings.webp"
              alt={t(locale, 'marketing.courier.shot2_caption')}
              width={460}
              height={1022}
              frame="phone"
            />
            <figcaption className="mt-4 text-center text-xs text-[#64748B]">
              {t(locale, 'marketing.courier.shot2_caption')}
            </figcaption>
          </figure>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {t(locale, 'marketing.courier.who_title')}
            </h2>
            <div className="mt-6 flex flex-col gap-6">
              {AUDIENCES.map((a) => (
                <div key={a.titleKey} className="border-l-2 border-[#4F46E5] pl-4">
                  <h3 className="text-base font-semibold">{t(locale, a.titleKey)}</h3>
                  <p className="mt-1 max-w-md text-sm leading-relaxed text-[#475569]">
                    {t(locale, a.bodyKey)}
                  </p>
                </div>
              ))}
            </div>
            <h2 className="mt-10 text-2xl font-semibold tracking-tight md:text-3xl">
              {t(locale, 'marketing.courier.start_title')}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-[#475569]">
              {t(locale, 'marketing.courier.start_body')}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#0F172A] text-white">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {t(locale, 'marketing.courier.cta_title')}
          </h2>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white shadow-md shadow-[#4F46E5]/25 ring-1 ring-inset ring-[#4338CA] transition-all hover:bg-[#4338CA]"
            >
              {t(locale, 'marketing.courier.cta_contact')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/cum-functioneaza"
              className="inline-flex items-center justify-center rounded-md border border-white/20 px-5 py-3 text-sm font-medium text-white hover:bg-white/5"
            >
              {t(locale, 'marketing.courier.cta_how')}
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter currentLocale={locale} />
    </main>
  );
}
