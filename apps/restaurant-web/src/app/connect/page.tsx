import type { Metadata } from 'next';
import { ArrowRight, Webhook, Truck, Brain } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { ConnectLeadForm } from '@/components/marketing/connect-lead-form';
import { getLocale } from '@/lib/i18n/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'HIR Connect — Livrare + AI pentru site-ul tău',
  description:
    'Ai deja site? Folosește HIR doar pentru livrare + AI. Site-ul tău rămâne neschimbat.',
  openGraph: {
    title: 'HIR Connect — Livrare + AI pentru site-ul tău',
    description:
      'Integrare headless pentru restaurante cu propriul site. API simplu, curierii HIR, AI insights — fără să-ți schimbi platforma.',
  },
};

const steps = [
  {
    number: '1',
    icon: Webhook,
    title: 'Conectează-ți site-ul',
    description:
      'Trimite comenzile din site-ul tău către HIR printr-un singur endpoint REST. Documentație completă, cheie API în 5 minute.',
  },
  {
    number: '2',
    icon: Truck,
    title: 'HIR preia livrarea',
    description:
      'Fiecare comandă intră automat în flota HIR. Dispatch, tracking live, notificări SMS/WhatsApp pentru clienți — totul fără efort din partea ta.',
  },
  {
    number: '3',
    icon: Brain,
    title: 'AI insights pe fluxul tău de comenzi',
    description:
      'Agenții AI HIR analizează comenzile, prevăd vârfurile de trafic, identifică clienții inactivi și îți trimit rapoarte zilnice direct în inbox.',
  },
];

export default async function ConnectPage() {
  const currentLocale = await getLocale();
  return (
    <>
      <MarketingHeader currentLocale={currentLocale} />
      <main>
        {/* Hero */}
        <section className="bg-gradient-to-b from-indigo-50 to-white px-4 pb-20 pt-16 text-center">
          <span className="mb-4 inline-flex items-center rounded-full border border-indigo-200 bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
            HIR Connect — headless tier
          </span>
          <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
            Ai deja site?{' '}
            <span className="text-indigo-600">Folosește HIR doar pentru livrare + AI.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-600">
            Site-ul tău rămâne neschimbat. HIR Connect se ocupă de dispatch curieri,
            tracking live și insights AI — direct pe fluxul tău de comenzi.
          </p>
          <p className="mx-auto mt-4 inline-flex max-w-xl items-center gap-2 rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
            Același tarif: 2 lei/comandă · Setup GRATUIT primele 50 de restaurante
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="#cere-acces"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              Solicită acces API
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
            <a
              href="/contact"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Vorbește cu echipa
            </a>
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            Pilot activ: deliveryhouse.ro (Brașov, 5 restaurante, 300+ comenzi/zi). Înscrie-te pentru acces timpuriu.
          </p>
        </section>

        {/* 3-step wizard outline */}
        <section className="mx-auto max-w-4xl px-4 pb-24 pt-16">
          <h2 className="mb-12 text-center text-2xl font-bold text-zinc-900">
            3 pași simpli
          </h2>
          <ol className="grid gap-8 sm:grid-cols-3">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.number}
                  className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                      {step.number}
                    </span>
                    <Icon className="h-5 w-5 text-indigo-500" aria-hidden />
                  </div>
                  <h3 className="text-base font-semibold text-zinc-900">{step.title}</h3>
                  <p className="text-sm text-zinc-600">{step.description}</p>
                </li>
              );
            })}
          </ol>
        </section>

        {/* What stays yours */}
        <section className="border-t border-zinc-100 bg-zinc-50 px-4 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-2xl font-bold text-zinc-900">
              Site-ul tău, nemodificat
            </h2>
            <p className="text-zinc-600">
              HIR Connect este un strat de servicii invizibil pentru clienții tăi.
              Comenzile vin din platforma ta, intră în HIR prin API, ajung la curier în
              câteva secunde. Tu controlezi brandul, UX-ul și relația cu clientul.
              HIR controlează logistica și AI-ul.
            </p>
          </div>
        </section>

        {/* Pricing */}
        <section className="border-t border-zinc-100 bg-white px-4 py-16">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-2 text-center text-2xl font-bold text-zinc-900">
              Tarif simplu, identic pentru toți
            </h2>
            <p className="mb-10 text-center text-sm text-zinc-500">
              Fără abonament. Fără diferențe între SaaS clasic și Connect. Plătești doar comenzile procesate.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center">
                <div className="text-3xl font-bold text-zinc-900">2 lei</div>
                <div className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                  per comandă procesată
                </div>
                <p className="mt-3 text-xs text-zinc-600">
                  Restaurantul plătește pe fiecare comandă livrată cu succes.
                </p>
              </div>
              <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center">
                <div className="text-3xl font-bold text-emerald-700">GRATUIT</div>
                <div className="mt-1 text-xs uppercase tracking-wide text-emerald-700">
                  setup primele 50
                </div>
                <p className="mt-3 text-xs text-emerald-800">
                  Integrarea API, plugin WordPress și onboarding — fără cost pentru primii 50 de parteneri.
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center">
                <div className="text-3xl font-bold text-zinc-900">+1 leu</div>
                <div className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                  livrare prin HIR (opțional)
                </div>
                <p className="mt-3 text-xs text-zinc-600">
                  Doar dacă alegi flota HIR pentru livrare. Restul aranjamentului — al tău.
                </p>
              </div>
            </div>
            <p className="mt-6 text-center text-xs text-zinc-400">
              Toate tarifele exclud TVA. Pentru HIR Connect (site propriu) facturarea este automată — generăm și emitem factura periodic, fără intervenție manuală. Pentru restaurantele care folosesc portalul HIR direct, cei 2 lei se rețin în timp real prin split payment (Netopia / Viva).
            </p>
          </div>
        </section>

        {/* Lead form */}
        <section id="cere-acces" className="border-t border-zinc-100 bg-gradient-to-b from-white to-indigo-50 px-4 py-16">
          <div className="mx-auto max-w-2xl">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-zinc-900">
                Cere acces API HIR Connect
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                Completează formularul de mai jos. Te contactăm în maxim 24h cu
                documentația, credențiale de test și pașii de integrare.
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <ConnectLeadForm />
            </div>
            <p className="mt-4 text-center text-xs text-zinc-500">
              Preferi email? Scrie la{' '}
              <a
                href="mailto:connect@hirforyou.ro"
                className="font-medium text-indigo-700 hover:text-indigo-900"
              >
                connect@hirforyou.ro
              </a>
              .
            </p>
          </div>
        </section>
      </main>
      <MarketingFooter currentLocale={currentLocale} />
    </>
  );
}
