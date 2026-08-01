// Clients page. Iulian 2026-08-01: "scrie simplu afaceri care folosesc hir.
// fara alte explicatii ... toate restaurantele trebuie sa aiba logo ul lor cu
// numar de locatii" — so: a heading, real logos, city + location count, and
// one line to get in touch. Nothing else. Data in lib/marketing/clients.ts.

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { MarketingHeader, MarketingFooter } from '@/components/marketing/marketing-shell';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { canonicalBaseUrl, marketingOgImageUrl } from '@/lib/seo-marketing';
import { MARKETING_CLIENTS } from '@/lib/marketing/clients';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const title = t(locale, 'marketing.clients.page_title');
  const description = t(locale, 'marketing.clients.page_description');
  const ogImage = marketingOgImageUrl({ title, subtitle: description });
  const h = await headers();
  const host = h.get('x-hir-host') ?? h.get('host')?.split(':')[0] ?? '';
  const url = `${canonicalBaseUrl(host)}/clienti`;
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

export default async function ClientsPage() {
  const currentLocale = await getLocale();

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <MarketingHeader active="/clienti" currentLocale={currentLocale} />

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
          {t(currentLocale, 'marketing.clients.hero_title')}
        </h1>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {MARKETING_CLIENTS.map((client) => (
            <li
              key={client.slug}
              className="flex flex-col items-center rounded-2xl border border-[#E2E8F0] bg-white p-7 text-center transition-shadow hover:shadow-md"
            >
              <span className="flex h-24 w-full items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={client.logo}
                  alt={client.name}
                  width={480}
                  height={200}
                  loading="lazy"
                  decoding="async"
                  className="max-h-20 w-auto max-w-full object-contain"
                />
              </span>
              <p className="mt-5 text-sm font-semibold tracking-tight text-[#0F172A]">
                {client.name}
              </p>
              <p className="mt-1 text-xs text-[#94A3B8]">
                {client.city} ·{' '}
                {t(
                  currentLocale,
                  client.locations === 1
                    ? 'marketing.clients.location_one'
                    : 'marketing.clients.location_other',
                  { count: client.locations },
                )}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-14">
          <Link
            href="/contact"
            className="group inline-flex items-center gap-1 text-sm font-medium text-[#4F46E5] transition-colors hover:text-[#4338CA] focus-visible:outline-2 focus-visible:outline-[#4F46E5] focus-visible:outline-offset-2"
          >
            {t(currentLocale, 'marketing.clients.cta_link')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </section>

      <MarketingFooter currentLocale={currentLocale} />
    </main>
  );
}
