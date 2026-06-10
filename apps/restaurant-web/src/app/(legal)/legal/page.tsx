// /legal — hub index page listing all legal documents in one organized place.
// Created 2026-06-10 per Iulian directive ("la legal sunt mult prea multe
// linkuri. fa doar cateva pagini cu subpagini — alambicat și fără rost").
// Footer now links here instead of listing 11 separate legal URLs; this page
// groups everything by category so users find what they need in one click.
//
// All sub-pages remain at their existing URLs (terms, privacy, politica-cookies,
// politica-livrare, politica-anulare-retragere, legal/dpa, legal/subprocesori,
// legal/utilizare-acceptabila, legal/rambursare, legal/companie) — no redirects,
// no SEO loss. This page is just an index.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, FileText, ShieldCheck, Cookie, Truck, RotateCcw, Building2, Users, AlertCircle } from 'lucide-react';
import { MarketingHeader, MarketingFooter } from '@/components/marketing/marketing-shell';
import { getLocale } from '@/lib/i18n/server';
import { tenantBaseUrl } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const url = `${tenantBaseUrl()}/legal`;
  const title =
    locale === 'en'
      ? 'Legal documents — HIRforYOU'
      : 'Documente legale — HIRforYOU';
  const description =
    locale === 'en'
      ? 'All HIRforYOU legal documents in one place: terms, privacy, GDPR DPA, delivery, cancellation, refund policies, cookies, sub-processors, company details.'
      : 'Toate documentele legale HIRforYOU într-un singur loc: termeni, confidențialitate, DPA GDPR, livrare, anulare, rambursare, cookies, sub-procesatori, date companie.';
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, en: url, 'x-default': url },
    },
    robots: { index: true, follow: true },
  };
}

type LegalLink = {
  href: string;
  Icon: typeof FileText;
  titleRo: string;
  titleEn: string;
  descRo: string;
  descEn: string;
};

const CATEGORIES: ReadonlyArray<{
  titleRo: string;
  titleEn: string;
  links: ReadonlyArray<LegalLink>;
}> = [
  {
    titleRo: 'Esențiale',
    titleEn: 'Essentials',
    links: [
      {
        href: '/terms',
        Icon: FileText,
        titleRo: 'Termeni și Condiții',
        titleEn: 'Terms & Conditions',
        descRo: 'Reguli de utilizare a platformei HIRforYOU.',
        descEn: 'Rules for using the HIRforYOU platform.',
      },
      {
        href: '/privacy',
        Icon: ShieldCheck,
        titleRo: 'Politica de confidențialitate',
        titleEn: 'Privacy Policy',
        descRo: 'Cum prelucrăm datele tale personale conform GDPR.',
        descEn: 'How we process your personal data under GDPR.',
      },
      {
        href: '/politica-cookies',
        Icon: Cookie,
        titleRo: 'Politica de cookies',
        titleEn: 'Cookies Policy',
        descRo: 'Ce cookie-uri folosim și cum le poți gestiona.',
        descEn: 'Which cookies we use and how you can manage them.',
      },
    ],
  },
  {
    titleRo: 'Comenzi și livrare',
    titleEn: 'Orders & delivery',
    links: [
      {
        href: '/politica-livrare',
        Icon: Truck,
        titleRo: 'Politica de livrare',
        titleEn: 'Delivery Policy',
        descRo: 'Cum se face livrarea, zone, timpi, costuri.',
        descEn: 'How delivery works, zones, timing, costs.',
      },
      {
        href: '/politica-anulare-retragere',
        Icon: RotateCcw,
        titleRo: 'Politica de anulare și retragere',
        titleEn: 'Cancellation & Withdrawal',
        descRo: 'Drept retragere 14 zile (OUG 34/2014) + excepții.',
        descEn: 'Right of withdrawal 14 days + exceptions.',
      },
      {
        href: '/legal/rambursare',
        Icon: AlertCircle,
        titleRo: 'Politica de rambursare',
        titleEn: 'Refund Policy',
        descRo: 'Cum și când primești banii înapoi.',
        descEn: 'How and when refunds are issued.',
      },
    ],
  },
  {
    titleRo: 'Pentru parteneri și operatori',
    titleEn: 'For partners & operators',
    links: [
      {
        href: '/legal/dpa',
        Icon: ShieldCheck,
        titleRo: 'DPA (Data Processing Agreement)',
        titleEn: 'DPA (Data Processing Agreement)',
        descRo: 'Contract GDPR art. 28 între HIR și vendor (controller).',
        descEn: 'GDPR Art. 28 contract between HIR and vendor (controller).',
      },
      {
        href: '/legal/subprocesori',
        Icon: Users,
        titleRo: 'Sub-procesatori',
        titleEn: 'Sub-processors',
        descRo: 'Lista terților care prelucrează date pentru HIR.',
        descEn: 'List of third parties processing data for HIR.',
      },
      {
        href: '/legal/utilizare-acceptabila',
        Icon: AlertCircle,
        titleRo: 'Utilizare acceptabilă',
        titleEn: 'Acceptable Use',
        descRo: 'Reguli pentru utilizarea corectă a platformei.',
        descEn: 'Rules for proper platform usage.',
      },
      {
        href: '/legal/companie',
        Icon: Building2,
        titleRo: 'Date companie',
        titleEn: 'Company details',
        descRo: 'HIRforYOU SRL — CUI, sediu, contact oficial.',
        descEn: 'HIRforYOU SRL — VAT, registered address, official contact.',
      },
    ],
  },
];

export default async function LegalHubPage() {
  const locale = await getLocale();
  const isEn = locale === 'en';

  return (
    <>
      <MarketingHeader active="/legal" currentLocale={locale} />
      <main className="min-h-screen bg-[#FAFAFA] text-[#0F172A]">
        <section className="border-b border-[#E2E8F0] bg-white">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 md:py-20">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
              {isEn ? 'Legal documents' : 'Documente legale'}
            </h1>
            <p className="mt-4 max-w-2xl text-base text-[#475569]">
              {isEn
                ? 'All HIRforYOU legal documents organized in one place. Each document opens its own page.'
                : 'Toate documentele legale HIRforYOU organizate într-un singur loc. Fiecare document se deschide pe pagina sa.'}
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
          <div className="space-y-12">
            {CATEGORIES.map((cat) => (
              <div key={cat.titleRo}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  {isEn ? cat.titleEn : cat.titleRo}
                </h2>
                <ul className="mt-4 grid gap-3 md:grid-cols-2">
                  {cat.links.map(({ href, Icon, titleRo, titleEn, descRo, descEn }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        className="group flex items-start gap-3 rounded-lg border border-[#E2E8F0] bg-white p-4 transition-colors hover:border-[#4F46E5] hover:bg-[#FAFAFA]"
                      >
                        <Icon
                          className="mt-0.5 h-5 w-5 flex-none text-[#4F46E5]"
                          aria-hidden
                        />
                        <div className="flex-1">
                          <h3 className="flex items-center gap-1 text-sm font-semibold text-[#0F172A]">
                            {isEn ? titleEn : titleRo}
                            <ArrowRight
                              className="h-3.5 w-3.5 text-[#94A3B8] transition-transform group-hover:translate-x-0.5 group-hover:text-[#4F46E5]"
                              aria-hidden
                            />
                          </h3>
                          <p className="mt-1 text-xs leading-relaxed text-[#64748B]">
                            {isEn ? descEn : descRo}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>
      <MarketingFooter currentLocale={locale} />
    </>
  );
}
