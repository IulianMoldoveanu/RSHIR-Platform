import type { Metadata } from 'next';
import Link from 'next/link';
import { Phone, MessageCircle, ArrowRight, CheckCircle2, Mail } from 'lucide-react';
import { marketingOgImageUrl } from '@/lib/seo-marketing';
import { DemoLeadForm } from './_components/demo-lead-form';

// /demo — paid-ads + reseller-link landing optimized for 60-second decision.
//
// Why this exists separate from `/`:
//   - Homepage carries SEO weight (5 JSON-LD schemas, full nav, footer).
//     Paid traffic does not need any of that and converts WORSE on it
//     because scroll depth drops with every distraction.
//   - Conversion best-practice: 5-second clarity, 1 visible CTA, 2-field
//     form, social proof above the fold.
//   - Tracked separately in GA4 so we can compare cost-per-lead vs `/`.
//
// Iulian (2026-05-12) signed off on a dedicated landing + A/B test plan.

const WHATSAPP_PHONE = '+40743700916';

export const metadata: Metadata = {
  title: 'HIR for You — Demo gratuit | Scapă de comisionul Glovo în 5 minute',
  description:
    'Vezi cum funcționează HIR pentru restaurantul tău. Demo de 15 minute, fără card, fără obligații. Comenzi proprii, livrare proprie, 2 lei pe comandă.',
  alternates: { canonical: 'https://hirforyou.ro/demo' },
  openGraph: {
    title: 'HIR for You — Demo gratuit pentru restaurantul tău',
    description:
      'Demo de 15 minute. Vezi exact cum scapi de comisionul agregatorilor și păstrezi 100% din venit.',
    url: 'https://hirforyou.ro/demo',
    type: 'website',
    locale: 'ro_RO',
    images: [
      {
        url: marketingOgImageUrl({
          title: 'Demo gratuit HIR for You',
          subtitle: 'Comenzi proprii. Livrare proprie. 2 lei/comandă.',
          variant: 'case-study',
        }),
        width: 1200,
        height: 630,
        alt: 'HIR for You — Demo',
      },
    ],
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

const OUTCOMES: ReadonlyArray<{ headline: string; sub: string }> = [
  {
    headline: 'Mai multe comenzi',
    sub: 'Site propriu + AI care recomandă clienților ce să adauge la coș. +15% valoare medie comandă în testele noastre.',
  },
  {
    headline: 'Mai puțin comision',
    sub: 'În loc de 25-30% (variază în funcție de contract) către agregator, plătești 2 lei fix pe comandă. Restul rămâne la tine.',
  },
  {
    headline: 'Echipa scapă de stres',
    sub: 'Comenzile din toate sursele (site, Glovo, Wolt, telefon) ajung pe un singur ecran în bucătărie. Fără tablete separate.',
  },
];

const PROOF_POINTS: ReadonlyArray<string> = [
  'Migrare meniu GloriaFood în 5 minute (158 produse, demonstrat live)',
  'Livrare cu flota HIR sau cu curierii tăi — decizi tu',
  'Facturare automată SmartBill / SAGA / e-Factura ANAF',
  'Suport în română, 24/7',
];

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Hero — 5-second clarity. H1 + 1-line subhead + 2 CTAs. */}
      <section className="mx-auto max-w-3xl px-4 pb-10 pt-12 sm:pt-20">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          Foișorul A — primul restaurant HIR live din 03.05.2026
        </div>
        <h1 className="text-3xl font-bold leading-tight text-zinc-900 sm:text-5xl">
          Comenzile tale. <br />
          <span className="text-violet-700">Livrarea ta. 2 lei pe comandă.</span>
        </h1>
        <p className="mt-4 text-base text-zinc-700 sm:text-lg">
          Înlocuim Glovo, Wolt și Bolt cu site-ul tău, livrare proprie și AI care lucrează 24/7. Demo de 15 minute, fără
          card.
        </p>

        {/* Primary CTA — WhatsApp deep link. RO HoReCa preferă WhatsApp peste email. */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`https://wa.me/${WHATSAPP_PHONE.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
              'Salut! Sunt interesat de demo-ul HIR for You pentru restaurantul meu.',
            )}`}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
            target="_blank"
            rel="noopener"
          >
            <MessageCircle className="h-5 w-5" aria-hidden />
            Programează demo pe WhatsApp
          </Link>
          <a
            href={`tel:${WHATSAPP_PHONE}`}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-6 py-3 text-base font-semibold text-zinc-900 hover:bg-zinc-100"
          >
            <Phone className="h-5 w-5" aria-hidden />
            Sună acum: 0743 700 916
          </a>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Răspundem în 5 minute pe WhatsApp în zilele lucrătoare 10-19. Sâmbătă-duminică 12-18.
        </p>
      </section>

      {/* Outcomes — 3 cards. Outcome-first language. No "AI", no "platform", no "stack". */}
      <section className="mx-auto max-w-5xl px-4 pb-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {OUTCOMES.map((outcome) => (
            <div
              key={outcome.headline}
              className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-zinc-900">{outcome.headline}</h2>
              <p className="mt-2 text-sm text-zinc-700">{outcome.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Proof points — 4 bullets. Concrete features, no jargon. */}
      <section className="mx-auto max-w-3xl px-4 pb-12">
        <h2 className="mb-4 text-xl font-bold text-zinc-900">Ce primești la demo</h2>
        <ul className="flex flex-col gap-3">
          {PROOF_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              <span className="text-sm text-zinc-800">{point}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Secondary — email form fallback for users who don't WhatsApp. 2 fields. */}
      <section className="mx-auto max-w-3xl px-4 pb-16">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <Mail className="h-5 w-5 text-violet-700" aria-hidden />
            <h2 className="text-lg font-semibold text-zinc-900">
              Nu folosești WhatsApp? Lasă-ne datele tale.
            </h2>
          </div>
          <p className="mb-4 text-sm text-zinc-700">
            Te sunăm noi în cel mai scurt timp posibil. Două câmpuri, fără spam.
          </p>
          <DemoLeadForm />
        </div>
      </section>

      {/* Trust strip — last anchor before exit. */}
      <section className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-8 text-center text-sm text-zinc-700 sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-900">Ai întrebări?</span>
            <Link href="/contact" className="text-violet-700 hover:underline">
              Contact direct
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span>Vrei să vezi toate funcționalitățile?</span>
            <Link href="/features" className="inline-flex items-center gap-1 text-violet-700 hover:underline">
              Funcționalități
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
