import Link from 'next/link';
import { ChevronLeft, Flame, Info } from 'lucide-react';
import { BusyHoursHeatmap } from './_heatmap';
import { cardClasses } from '@/components/card';

export const metadata = {
  title: 'Ore cu volum mare — HIR Curier',
};

export default function BusyHoursPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Link
        href="/dashboard/settings"
        className="inline-flex min-h-[32px] items-center gap-1.5 self-start rounded-lg px-1 text-xs font-medium text-hir-muted-fg transition-colors hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Setări
      </Link>

      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30">
          <Flame className="h-5 w-5 text-violet-300" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-hir-fg">
            Ore cu volum mare
          </h1>
          <p className="mt-0.5 text-sm leading-relaxed text-hir-muted-fg">
            Imagine de ansamblu a momentelor cu cele mai multe comenzi.
            Folosește-l ca să-ți planifici tura — volumul real variază în
            funcție de oraș, vreme și evenimente.
          </p>
        </div>
      </header>

      <BusyHoursHeatmap />

      <section
        aria-label="Notă despre date"
        className={cardClasses({ padding: 'sm', className: 'flex items-start gap-2 text-xs leading-relaxed text-hir-muted-fg' })}
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-hidden />
        <p>
          Datele sunt orientative, derivate din distribuția comenzilor în
          pilotul Brașov (apr–mai 2026). Pe măsură ce platforma crește, le
          vom înlocui cu măsurători live per oraș.
        </p>
      </section>
    </div>
  );
}
