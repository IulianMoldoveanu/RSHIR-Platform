import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronDown, HelpCircle, LifeBuoy, Mail, Phone } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { getLocale } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const revalidate = 3600;

// Public-facing help center for end customers (the people who place orders
// on tenant storefronts).
// Lane WEB-I18N-EN-PARITY (2026-05-15): migrated to use t() for all
// visible strings. EN copy added to dictionaries.ts under help.*.

const PRIMARY_DOMAIN = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || '';
const HELP_URL = PRIMARY_DOMAIN
  ? `https://${PRIMARY_DOMAIN}/ajutor`
  : 'https://hir-restaurant-web.vercel.app/ajutor';

export const metadata: Metadata = {
  title: 'Ajutor — HIR',
  description:
    'Răspunsuri pentru clienții HIR: cum urmăresc comanda, cum o anulez, cum plătesc, ce fac dacă întârzie.',
  alternates: { canonical: HELP_URL },
  robots: { index: true, follow: true },
};

export default function HelpPublicPage() {
  const locale = getLocale();

  const faqs = [
    { q: t(locale, 'help.faq_q1'), a: t(locale, 'help.faq_a1') },
    { q: t(locale, 'help.faq_q2'), a: t(locale, 'help.faq_a2') },
    { q: t(locale, 'help.faq_q3'), a: t(locale, 'help.faq_a3') },
    { q: t(locale, 'help.faq_q4'), a: t(locale, 'help.faq_a4') },
    { q: t(locale, 'help.faq_q5'), a: t(locale, 'help.faq_a5') },
    { q: t(locale, 'help.faq_q6'), a: t(locale, 'help.faq_a6') },
    { q: t(locale, 'help.faq_q7'), a: t(locale, 'help.faq_a7') },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      <MarketingHeader currentLocale={locale} />

      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-medium text-[#4338CA]">
            <HelpCircle className="h-3 w-3" aria-hidden />
            {t(locale, 'help.badge')}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#0F172A] sm:text-4xl">
            {t(locale, 'help.title')}
          </h1>
          <p className="max-w-2xl text-sm text-[#475569] sm:text-base">
            {t(locale, 'help.intro')}
          </p>
        </header>

        <section className="mt-8 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <ul className="divide-y divide-[#F1F5F9]">
            {faqs.map((f, i) => (
              <li key={i}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-[#F8FAFC]">
                    <span className="text-sm font-medium text-[#0F172A] sm:text-base">
                      {f.q}
                    </span>
                    <ChevronDown
                      className="h-4 w-4 flex-none text-[#94A3B8] transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <p className="px-4 pb-4 text-sm leading-relaxed text-[#475569]">
                    {f.a}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 rounded-xl border border-[#E2E8F0] bg-white p-5">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-[#4F46E5]" aria-hidden />
            <h2 className="text-sm font-semibold text-[#0F172A]">
              {t(locale, 'help.still_need_help')}
            </h2>
          </div>
          <p className="mt-1 text-sm text-[#475569]">
            {t(locale, 'help.still_need_help_body')}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a
              href="tel:+40743700916"
              className="flex items-center gap-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] transition-colors hover:border-emerald-300 hover:bg-white"
            >
              <Phone className="h-4 w-4 flex-none text-emerald-500" aria-hidden />
              <span className="flex-1 truncate">+40 743 700 916</span>
              <span className="text-[10px] text-[#94A3B8]">{t(locale, 'help.phone_hours')}</span>
            </a>
            <a
              href="mailto:office@hirforyou.ro"
              className="flex items-center gap-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] transition-colors hover:border-[#C7D2FE] hover:bg-white"
            >
              <Mail className="h-4 w-4 flex-none text-[#4F46E5]" aria-hidden />
              <span className="flex-1 truncate">office@hirforyou.ro</span>
            </a>
          </div>
          <p className="mt-4 text-xs text-[#94A3B8]">
            {/* TODO: Wire this once a storefront-specific contact hint is in the dictionary */}
            {locale === 'ro'
              ? 'Pentru probleme operative cu o comandă activă, contactați direct restaurantul folosind numărul de telefon din pagina de tracking.'
              : 'For issues with an active order, contact the restaurant directly using the phone number on the tracking page.'}
          </p>
        </section>

        <p className="mt-6 text-center text-[11px] text-[#94A3B8]">
          {t(locale, 'help.footer_note').split('·')[0].trim()} ·{' '}
          <Link href="/privacy" className="hover:text-[#0F172A]">
            {t(locale, 'help.privacy_link')}
          </Link>
        </p>
      </main>

      <MarketingFooter currentLocale={locale} />
    </div>
  );
}
