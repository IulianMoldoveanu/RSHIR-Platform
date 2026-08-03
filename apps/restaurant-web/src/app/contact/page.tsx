import type { Metadata } from 'next';
import { Mail, Phone } from 'lucide-react';
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
  subtitle: 'Telefon, email sau formular.',
});

export const metadata: Metadata = {
  title: 'Contact — HIRforYOU',
  description: 'Contactează echipa HIR: telefon, email sau formular.',
  alternates: {
    canonical: CONTACT_URL,
    languages: { 'ro-RO': CONTACT_URL, en: CONTACT_URL, 'x-default': CONTACT_URL },
  },
  openGraph: {
    title: 'Contact — HIRforYOU',
    description: 'Vorbește cu echipa HIR: telefon, email sau formular.',
    type: 'website',
    locale: 'ro_RO',
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Contact HIR' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact — HIRforYOU',
    description: 'Telefon, email sau formular.',
    images: [OG_IMAGE],
  },
  robots: { index: true, follow: true },
};

export default async function ContactPage() {
  const locale = await getLocale();
  return (
    <main
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <MarketingHeader active="/contact" currentLocale={locale} />

      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-20">
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
            {t(locale, 'contact.hero_title')}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#475569]">
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

      {/* 2026-08-03 — the phone/email/address column that used to sit left of
          the form is gone, per Iulian ("elimina datele din stanga formularului
          de contact, sunt dublate, deja apar sus"). He's right: the same phone
          and the same email are already the two buttons in the hero, one screen
          above. The address was the only thing unique to that column, and it
          isn't the legal disclosure point — company identification under Legea
          365/2002 art. 5 lives on /legal/companie and on the storefront footer
          that accompanies an actual purchase. contact.label_* / address_value /
          details_title are now inert, same convention as the rest of this file.
          The form is centred on its own instead of holding a two-thirds column
          next to an empty one. */}
      <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-6 sm:p-8">
          <h2 className="text-base font-semibold text-[#0F172A]">
            {t(locale, 'contact.form_title')}
          </h2>
          <p className="mt-1 text-sm text-[#475569]">{t(locale, 'contact.form_body')}</p>
          <div className="mt-6">
            <ContactForm locale={locale} />
          </div>
        </div>
      </section>

      <MarketingFooter currentLocale={locale} />
    </main>
  );
}

