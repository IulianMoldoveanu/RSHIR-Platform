'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChefHat, Bike, PartyPopper } from 'lucide-react';

type Stage = 0 | 1 | 2 | 3;

const STAGES: Array<{ label: string; icon: typeof Check }> = [
  { label: 'Comandă primită', icon: Check },
  { label: 'În pregătire', icon: ChefHat },
  { label: 'Curier în drum', icon: Bike },
  { label: 'Livrată', icon: PartyPopper },
];

// Purely client-side timed simulation — no order row, no courier dispatch,
// no realtime subscription. Exists only to show a visitor what the real
// order-tracking experience looks like.
export default function DemoConfirmationPage() {
  const [stage, setStage] = useState<Stage>(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 1800),
      setTimeout(() => setStage(2), 4200),
      setTimeout(() => setStage(3), 7000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="mx-auto max-w-md px-4 py-10 text-center">
      <h1 className="text-lg font-bold text-zinc-900">Comandă demo plasată!</h1>
      <p className="mt-1 text-sm text-zinc-500">Așa arată urmărirea comenzii în timp real pentru clienții tăi.</p>

      <div className="mt-8 flex flex-col gap-4">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          const active = i <= stage;
          return (
            <div key={s.label} className="flex items-center gap-3 text-left">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                  active ? 'bg-[var(--hir-brand)] text-white' : 'bg-zinc-100 text-zinc-400'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </div>
              <span className={`text-sm font-medium ${active ? 'text-zinc-900' : 'text-zinc-400'}`}>{s.label}</span>
            </div>
          );
        })}
      </div>

      <Link
        href="/demo-storefront"
        className="mt-10 inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 px-5 text-sm font-semibold text-zinc-700"
      >
        Încearcă din nou demo-ul
      </Link>
      <div className="mt-3">
        {/* 2026-08-01 — was /pricing (retired, 301s to `/`). This is someone
            who just finished the demo and said "I want this" — the right
            next step is a real conversation, not a pitch page. */}
        <Link href="/contact" className="text-xs font-semibold text-[var(--hir-brand)] underline">
          Vreau asta pentru restaurantul meu →
        </Link>
      </div>
    </div>
  );
}
