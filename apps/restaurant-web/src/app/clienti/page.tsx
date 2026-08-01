import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { ArrowRight, MapPin } from 'lucide-react';
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
  const host = (await headers()).get('x-hir-host') ?? (await headers()).get('host')?.split(':')[0] ?? '';
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

      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <span className="inline-flex items-center rounded-full border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-1 text-xs font-semibold text-[#4338CA]">
            {t(currentLocale, 'marketing.clients.hero_eyebrow')}
          </span>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl">
            {t(currentLocale, 'marketing.clients.hero_title')}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[#475569]">
            {t(currentLocale, 'marketing.clients.hero_intro')}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2">
          {MARKETING_CLIENTS.map((client) => {
            const [from, to] = client.gradient;
            return (
              <div
                key={client.slug}
                className="flex items-center gap-4 rounded-2xl border border-[#E2E8F0] bg-white p-6 transition-shadow hover:shadow-md"
              >
                <div
                  className="flex h-16 w-16 flex-none items-center justify-center rounded-[20px] text-xl font-bold text-white"
                  style={{
                    background: `radial-gradient(circle at 30% 22%, rgba(255,255,255,0.45), transparent 45%), linear-gradient(135deg, ${from}, ${to})`,
                    boxShadow: `0 8px 20px -8px ${to}80`,
                  }}
                  aria-hidden
                >
                  {client.name.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold tracking-tight text-[#0F172A]">
                    {client.name}
                  </h2>
                  <p className="mt-0.5 text-sm text-[#475569]">
                    {client.type[currentLocale === 'en' ? 'en' : 'ro']}
                  </p>
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-[#94A3B8]">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {client.city}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-t border-[#E2E8F0] bg-[#0F172A] text-white">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {t(currentLocale, 'marketing.clients.cta_title')}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-[#CBD5E1]">
            {t(currentLocale, 'marketing.clients.cta_body')}
          </p>
          <div className="mt-7">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white shadow-md shadow-[#4F46E5]/25 ring-1 ring-inset ring-[#4338CA] transition-all hover:bg-[#4338CA] hover:shadow-lg hover:shadow-[#4F46E5]/30"
            >
              {t(currentLocale, 'marketing.clients.cta_link')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter currentLocale={currentLocale} />
    </main>
  );
}
