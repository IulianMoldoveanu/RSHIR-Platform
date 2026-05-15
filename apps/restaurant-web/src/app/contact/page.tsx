import type { Metadata } from 'next';
import { Mail, Phone, MapPin } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { getLocale } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import { ContactForm } from './contact-form';
import { marketingOgImageUrl } from '@/lib/seo-marketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lane EN-I18N PR D — language alternates (cookie-based locale, same URL).
// Lane WEB-I18N-EN-PARITY (2026-05-15): all visible strings threaded
// through t(locale, ...) against contact.* dictionary keys.
const PRIMARY_DOMAIN = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || '';
const CONTACT_URL = PRIMARY_DOMAIN
  ? `https://${PRIMARY_DOMAIN}/contact`
  : 'https://hir-restaurant-web.vercel.app/contact';

const OG_IMAGE = marketingOgImageUrl({
  title: 'Contact HIR',
  subtitle: 'Răspuns în 24 de ore lucrătoare. Pentru restaurante, flote și parteneri.',
});

export const metadata: Metadata = {
  title: 'Contact — HIRforYOU',
  description:
    'Vorbește cu echipa HIR. Pentru restaurante, flote și parteneri. Email, telefon, formular direct.',
  alternates: {
    canonical: CONTACT_URL,
    languages: { 'ro-RO': CONTACT_URL, en: CONTACT_URL, 'x-default': CONTACT_URL },
  },
  openGraph: {
    title: 'Contact — HIRforYOU',
    description: 'Vorbește cu echipa HIR. Răspuns în 24 de ore lucrătoare.',
    type: 'website',
    locale: 'ro_RO',
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Contact HIR' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact — HIRforYOU',
    description: 'Răspuns în 24 de ore lucrătoare.',
    images: [OG_IMAGE],
  },
  robots: { index: true, follow: true },
};

export default function ContactPage() {
  const locale = getLocale();
  return (
    <main
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <MarketingHeader active="/contact" currentLocale={locale} />

      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-20">
          <div className="mb-3 inline-flex items-center rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            {t(locale, 'contact.eyebrow')}
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
            {t(locale, 'contact.hero_title')}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#475569]">
            {t(locale, 'contact.hero_body')}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="tel:+40743700916"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
            >
              <Phone className="h-4 w-4" aria-hidden />
              {t(locale, 'contact.cta_call')}
            </a>
            <a
              href="mailto:office@hirforyou.ro"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-[#E2E8F0] bg-white px-5 py-3 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
            >
              <Mail className="h-4 w-4" aria-hidden />
              office@hirforyou.ro
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 md:grid-cols-3">
          <div className="md:col-span-1">
            <h2 className="text-base font-semibold text-[#0F172A]">
              {t(locale, 'contact.team_title')}
            </h2>
            <p className="mt-2 text-sm text-[#475569]">
              {t(locale, 'contact.team_body')}
            </p>
            <ul className="mt-7 space-y-5 text-sm">
              <ContactRow
                icon={<Phone className="h-4 w-4" />}
                label={t(locale, 'contact.label_phone')}
                value="+40 743 700 916"
                href="tel:+40743700916"
              />
              <ContactRow
                icon={<Mail className="h-4 w-4" />}
                label={t(locale, 'contact.label_email')}
                value="office@hirforyou.ro"
                href="mailto:office@hirforyou.ro"
              />
              <ContactRow
                icon={<MapPin className="h-4 w-4" />}
                label={t(locale, 'contact.label_address')}
                value={t(locale, 'contact.address_value')}
              />
            </ul>
            <div className="mt-10 rounded-md border border-[#E2E8F0] bg-white p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
                {t(locale, 'contact.partners_title')}
              </h3>
              <p className="mt-2 text-sm text-[#475569]">
                {t(locale, 'contact.partners_body')}
              </p>
              <a
                href="/parteneriat/inscriere"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#4F46E5] hover:text-[#4338CA]"
              >
                {t(locale, 'contact.partners_link')}
              </a>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-6 sm:p-8">
              <h2 className="text-base font-semibold text-[#0F172A]">
                {t(locale, 'contact.form_title')}
              </h2>
              <p className="mt-1 text-sm text-[#475569]">
                {t(locale, 'contact.form_body')}
              </p>
              <div className="mt-6">
                <ContactForm locale={locale} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter currentLocale={locale} />
    </main>
  );
}

function ContactRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <>
      <span className="mt-0.5 inline-flex h-7 w-7 flex-none items-center justify-center rounded-md bg-[#EEF2FF] text-[#4F46E5]">
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
          {label}
        </span>
        <span className="mt-0.5 block text-sm font-medium text-[#0F172A]">
          {value}
        </span>
      </span>
    </>
  );

  if (href) {
    return (
      <li>
        <a href={href} className="flex gap-3 transition-colors hover:text-[#4F46E5]">
          {inner}
        </a>
      </li>
    );
  }
  return <li className="flex gap-3">{inner}</li>;
}
