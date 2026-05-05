import type { Metadata } from 'next';
import { Mail, Phone, MapPin } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { ContactForm } from './contact-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Contact — HIR Restaurant Suite',
  description:
    'Vorbește cu echipa HIR. Pentru restaurante, flote și parteneri. Email, telefon, formular direct.',
  openGraph: {
    title: 'Contact — HIR Restaurant Suite',
    description: 'Vorbește cu echipa HIR. Răspuns în 24 de ore lucrătoare.',
    type: 'website',
    locale: 'ro_RO',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export default function ContactPage() {
  return (
    <main
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <MarketingHeader active="/contact" />

      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-20">
          <div className="mb-3 inline-flex items-center rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            Contact
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
            Hai să vorbim despre restaurantul tău.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#475569]">
            Răspundem în 24 de ore lucrătoare. Pentru demo live, programăm un apel
            de 20 de minute în care îți arătăm platforma pe contul tău real.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 md:grid-cols-3">
          <div className="md:col-span-1">
            <h2 className="text-base font-semibold text-[#0F172A]">Echipa HIR</h2>
            <p className="mt-2 text-sm text-[#475569]">
              Suntem o echipă mică, construim în România, răspundem direct.
            </p>
            <ul className="mt-7 space-y-5 text-sm">
              <ContactRow
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value="contact@hiraisolutions.ro"
                href="mailto:contact@hiraisolutions.ro"
              />
              <ContactRow
                icon={<Phone className="h-4 w-4" />}
                label="Telefon"
                value="+40 (rezervat la formular)"
              />
              <ContactRow
                icon={<MapPin className="h-4 w-4" />}
                label="Sediu"
                value="Brașov, România"
              />
            </ul>
            <div className="mt-10 rounded-md border border-[#E2E8F0] bg-white p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
                Pentru parteneri
              </h3>
              <p className="mt-2 text-sm text-[#475569]">
                Ești manager de flotă, agenție sau consultant? Folosește formularul
                de afiliat dedicat:
              </p>
              <a
                href="/affiliate"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#4F46E5] hover:text-[#4338CA]"
              >
                Aplică pentru program afiliat →
              </a>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-6 sm:p-8">
              <h2 className="text-base font-semibold text-[#0F172A]">
                Trimite-ne un mesaj
              </h2>
              <p className="mt-1 text-sm text-[#475569]">
                Completează formularul. Te contactăm pe email în 24 de ore.
              </p>
              <div className="mt-6">
                <ContactForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
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
        <a
          href={href}
          className="flex gap-3 transition-colors hover:text-[#4F46E5]"
        >
          {inner}
        </a>
      </li>
    );
  }
  return <li className="flex gap-3">{inner}</li>;
}
