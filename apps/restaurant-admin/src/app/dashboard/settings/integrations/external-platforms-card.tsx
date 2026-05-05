// HIR Restaurant Suite — Phase 1 of "external platform source".
//
// Read-only card grid that signals to the operator (and to the visiting
// reseller / GloriaFood migrant) which delivery aggregators HIR will
// integrate with so a single dashboard absorbs every Glovo / Wolt / Tazz /
// foodpanda / Bolt Food order. Phase 1 ships display only — no DB row, no
// OAuth, no webhook handler. Phase 2 wires `source='GLOVO'` etc. via the
// per-platform webhooks.
//
// Distribution impact: gives Iulian a tangible artifact to demo on his
// Bucharest reseller tour — "look, the aggregator panel is already there,
// the platforms light up as we sign each integration agreement". No
// promise leakage: every card carries an explicit "În curând" pill.

import type { ReactNode } from 'react';

type Platform = {
  key: string;
  label: string;
  // RO description: <50 chars, fits 360px viewport.
  blurb: string;
  // Tailwind palette only — keeps color tokens consistent with the rest
  // of the dashboard (no random hex).
  accent: string;
  badge: string;
};

const PLATFORMS: Platform[] = [
  {
    key: 'GLOVO',
    label: 'Glovo',
    blurb: 'Comenzi Glovo în același tablou, fără tabletă.',
    accent: 'bg-yellow-50 ring-yellow-300',
    badge: 'bg-yellow-100 text-yellow-900 ring-yellow-300',
  },
  {
    key: 'WOLT',
    label: 'Wolt',
    blurb: 'Comenzi Wolt sincronizate cu meniul HIR.',
    accent: 'bg-cyan-50 ring-cyan-300',
    badge: 'bg-cyan-100 text-cyan-900 ring-cyan-300',
  },
  {
    key: 'TAZZ',
    label: 'Tazz',
    blurb: 'Comenzi Tazz preluate automat de aplicația HIR.',
    accent: 'bg-orange-50 ring-orange-300',
    badge: 'bg-orange-100 text-orange-900 ring-orange-300',
  },
  {
    key: 'FOODPANDA',
    label: 'foodpanda',
    blurb: 'Comenzi foodpanda agregate într-un singur ecran.',
    accent: 'bg-pink-50 ring-pink-300',
    badge: 'bg-pink-100 text-pink-900 ring-pink-300',
  },
  {
    key: 'BOLT_FOOD',
    label: 'Bolt Food',
    blurb: 'Comenzi Bolt Food gestionate alături de comenzile proprii.',
    accent: 'bg-emerald-50 ring-emerald-300',
    badge: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
  },
];

export function ExternalPlatformsCard(): ReactNode {
  return (
    <section
      aria-labelledby="external-platforms-heading"
      className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5"
    >
      <header className="flex flex-col gap-1">
        <h2
          id="external-platforms-heading"
          className="text-base font-semibold text-zinc-900"
        >
          Platforme externe
        </h2>
        <p className="text-sm text-zinc-600">
          În curând puteți primi comenzile din Glovo, Wolt, Tazz, foodpanda
          și Bolt Food direct în aplicația HIR, fără tabletă separată.
        </p>
      </header>

      <ul
        role="list"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {PLATFORMS.map((p) => (
          <li
            key={p.key}
            className={`flex flex-col gap-2 rounded-lg p-4 ring-1 ring-inset ${p.accent}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-zinc-900">{p.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${p.badge}`}
              >
                În curând
              </span>
            </div>
            <p className="text-xs text-zinc-700">{p.blurb}</p>
          </li>
        ))}
      </ul>

      <p className="text-xs text-zinc-500">
        Vă anunțăm pe email când fiecare platformă devine disponibilă. Pentru
        comenzile primite via API HIR sau POS, folosiți secțiunile de mai sus.
      </p>
    </section>
  );
}
