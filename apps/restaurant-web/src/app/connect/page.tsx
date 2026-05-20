import type { Metadata } from 'next';
import { ArrowRight, Webhook, Truck, Brain } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
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

export default function ConnectPage() {
  const currentLocale = getLocale();
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
            Site-ul tău rămâne neschimbat. HIR Connect se ocupă de dispatch curiteri,
            tracking live și insights AI — direct pe fluxul tău de comenzi.
          </p>
          <a
            href="mailto:connect@hirforyou.ro?subject=Acces%20API%20HIR%20Connect"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            Solicită acces API
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <p className="mt-3 text-xs text-zinc-400">
            Pilot activ: deliveryhouse.ro (Brașov, 5 restaurante). Înscrie-te pentru acces timpuriu.
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

        {/* CTA footer */}
        <section className="bg-indigo-600 px-4 py-16 text-center">
          <h2 className="mb-3 text-2xl font-bold text-white">
            Gata să integrezi?
          </h2>
          <p className="mb-6 text-indigo-200">
            Trimite-ne un email și îți răspundem în 24h cu documentația API și credențialele de test.
          </p>
          <a
            href="mailto:connect@hirforyou.ro?subject=Acces%20API%20HIR%20Connect"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50"
          >
            Obține acces API
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </section>
      </main>
      <MarketingFooter currentLocale={currentLocale} />
    </>
  );
}
