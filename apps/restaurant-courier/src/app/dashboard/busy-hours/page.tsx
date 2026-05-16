import Link from 'next/link';
import { ChevronLeft, Info } from 'lucide-react';
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
        className="flex min-h-[44px] items-center gap-1 self-start text-sm text-hir-muted-fg hover:text-hir-fg"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Setări
      </Link>

      <header>
        <h1 className="text-xl font-bold text-hir-fg">Ore cu volum mare</h1>
        <p className="mt-1 text-sm text-hir-muted-fg">
          O imagine de ansamblu a momentelor în care platforma are de obicei
          cele mai multe comenzi. Folosește-l ca să-ți planifici tura, nu ca
          garanție — volumul real variază în funcție de oraș, vreme și evenimente.
        </p>
      </header>

      <BusyHoursHeatmap />

      <section
        aria-label="Notă despre date"
        className={cardClasses({ padding: 'sm', className: 'flex items-start gap-2 text-xs text-hir-muted-fg' })}
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" aria-hidden />
        <p>
          Datele sunt orientative, derivate din distribuția comenzilor în
          pilotul Brașov (apr–mai 2026). Pe măsură ce platforma crește, le
          vom înlocui cu măsurători live per oraș.
        </p>
      </section>
    </div>
  );
}
