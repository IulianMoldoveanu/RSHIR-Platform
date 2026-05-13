import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, ArrowRight, Calculator, MessageCircle, Phone } from 'lucide-react';
import { marketingOgImageUrl } from '@/lib/seo-marketing';
import { ResellerRevenueCalculator } from './_components/reseller-revenue-calculator';

// /parteneri — top-of-funnel landing for the reseller program.
//
// Sibling routes:
//   /parteneriat/inscriere — actual signup form (auth user + partners
//     row + affiliate_applications row). High-intent.
//   /parteneri — this page. Browse-before-signup: outcomes, revenue
//     calculator, FAQ. Funnels into /parteneriat/inscriere.
//
// Why split: a single signup-first page converts inbound resellers
// who already know the program, but cold traffic (LinkedIn DMs, agency
// referrals) needs an explainer first. Same pattern as Stripe's
// `/partners` vs `/atlas/sign-up`.

const WHATSAPP_PHONE = '+40743700916';

export const metadata: Metadata = {
  title: 'Program partener HIR for You — câștigi 500 RON + 10% recurring per restaurant adus',
  description:
    'Adu restaurante pe HIR for You și câștigi 500 RON la fiecare semnare + 10% din factura primelor 6 luni. Termeni finali se confirmă la aprobare.',
  alternates: { canonical: 'https://hirforyou.ro/parteneri' },
  openGraph: {
    title: 'Program partener HIR for You',
    description: 'Câștigi 500 RON la semnare + 10% recurring 6 luni. Cod de referral + link personal după înscriere.',
    url: 'https://hirforyou.ro/parteneri',
    type: 'website',
    locale: 'ro_RO',
    images: [
      {
        url: marketingOgImageUrl({
          title: 'Devino partener HIR for You',
          subtitle: '500 RON / restaurant + 10% recurring 6 luni',
          variant: 'partner',
        }),
        width: 1200,
        height: 630,
        alt: 'HIR for You — Program partener',
      },
    ],
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

const HOW_IT_WORKS: ReadonlyArray<{ step: string; title: string; sub: string }> = [
  {
    step: '01',
    title: 'Te înscrii în 60 de secunde',
    sub: 'Email + parolă + 3 câmpuri despre tine. Primești codul tău de referral imediat, înainte ca echipa să aprobe contul.',
  },
  {
    step: '02',
    title: 'Trimiți link-ul tău restaurantelor',
    sub: 'Partajezi hirforyou.ro/r/CODUL-TĂU pe WhatsApp, LinkedIn sau direct. Fiecare semnare via linkul tău e trackuită automat.',
  },
  {
    step: '03',
    title: 'Câștigi 500 RON la semnare + 10% recurring',
    sub: 'Plătim săptămânal prin transfer bancar. Termeni finali confirmați după aprobarea contului tău.',
  },
];

const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: 'Cum sunt plătit?',
    a: 'Transfer bancar săptămânal, în RON. 500 RON net la semnare (când restaurantul intră în primul interval de facturare) + 10% din venitul HIR de la restaurant pentru primele 6 luni.',
  },
  {
    q: 'Câte restaurante pot aduce?',
    a: 'Fără limită. Dacă aduci peste 10 restaurante în primele 3 luni, intri în programul de Partener Premium cu termeni preferențiali (negociabili).',
  },
  {
    q: 'Cine sunt resellerii ideali pentru HIR?',
    a: 'Consultanți HoReCa, agenții de marketing care lucrează cu restaurante, foști angajați Glovo/Tazz/Bolt, contabili specializați pe HoReCa, distribuitori de aparatură fiscală.',
  },
  {
    q: 'Plătiți și pentru lead-uri necalificate?',
    a: 'Nu. Plătim doar pentru semnare confirmată. Lead-urile necalificate (curiozi, fără restaurant operațional, fără volum) nu generează plată.',
  },
  {
    q: 'Termenii contractuali sunt definitivi?',
    a: 'Termenii actuali (500 RON + 10% recurring 6 luni) sunt în roll-out 2026. Variația posibilă: bonus volum la 10+ restaurante, termeni preferențiali pentru parteneri exclusivi. Confirmare finală la aprobare.',
  },
];

export default function ParteneriPage() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Hero */}
      <section className="mx-auto max-w-3xl px-4 pb-10 pt-12 sm:pt-20">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          Programul partener este deschis pentru reseller activi din 2026
        </div>
        <h1 className="text-3xl font-bold leading-tight text-zinc-900 sm:text-5xl">
          Adu restaurante pe HIR. <br />
          <span className="text-violet-700">Câștigi 500 RON + 10% recurring.</span>
        </h1>
        <p className="mt-4 text-base text-zinc-700 sm:text-lg">
          Cel mai simplu mod de a monetiza rețeaua ta de contacte HoReCa. Cont și cod de referral instant, plată
          săptămânală, fără minim de volum.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/parteneriat/inscriere"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-700 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-violet-800"
          >
            Înscrie-te în 60 de secunde
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
          <Link
            href={`https://wa.me/${WHATSAPP_PHONE.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
              'Salut! Sunt interesat de programul partener HIR for You.',
            )}`}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-6 py-3 text-base font-semibold text-zinc-900 hover:bg-zinc-100"
            target="_blank"
            rel="noopener"
          >
            <MessageCircle className="h-5 w-5" aria-hidden />
            Întreabă pe WhatsApp
          </Link>
        </div>
      </section>

      {/* How it works — 3 steps */}
      <section className="mx-auto max-w-5xl px-4 pb-12">
        <h2 className="mb-6 text-xl font-bold text-zinc-900 sm:text-2xl">Cum funcționează</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {HOW_IT_WORKS.map((step) => (
            <div
              key={step.step}
              className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
            >
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
                {step.step}
              </div>
              <h3 className="text-base font-semibold text-zinc-900">{step.title}</h3>
              <p className="text-sm text-zinc-700">{step.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Revenue calculator */}
      <section className="mx-auto max-w-3xl px-4 pb-12">
        <div className="mb-4 flex items-center gap-2">
          <Calculator className="h-6 w-6 text-violet-700" aria-hidden />
          <h2 className="text-xl font-bold text-zinc-900 sm:text-2xl">Calculează cât poți câștiga</h2>
        </div>
        <p className="mb-6 text-sm text-zinc-700">
          Introdu cât restaurante poți aduce și care e volumul lor mediu de comenzi. Rezultatul e estimativ pe baza
          termenilor curenți (500 RON / semnare + 10% recurring 6 luni).
        </p>
        <ResellerRevenueCalculator />
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 pb-12">
        <h2 className="mb-6 text-xl font-bold text-zinc-900 sm:text-2xl">Întrebări frecvente</h2>
        <div className="flex flex-col gap-4">
          {FAQ.map((item) => (
            <details key={item.q} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <summary className="cursor-pointer list-none text-base font-semibold text-zinc-900">
                {item.q}
              </summary>
              <p className="mt-3 text-sm text-zinc-700">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA strip */}
      <section className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" aria-hidden />
          <h2 className="text-2xl font-bold text-zinc-900">Gata să începi?</h2>
          <p className="max-w-md text-sm text-zinc-700">
            Înscrie-te acum — codul tău de referral și linkul personal sunt generate imediat după primul submit, fără
            să aștepți aprobarea echipei.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/parteneriat/inscriere"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-700 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-violet-800"
            >
              Înscriere instant
              <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
            <a
              href={`tel:${WHATSAPP_PHONE}`}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-6 py-3 text-base font-semibold text-zinc-900 hover:bg-zinc-100"
            >
              <Phone className="h-5 w-5" aria-hidden />
              Sună: 0743 700 916
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
