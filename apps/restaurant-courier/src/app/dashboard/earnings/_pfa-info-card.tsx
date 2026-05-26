import { FileText, ChevronRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/card';

/**
 * PFA onboarding hint — visible only to couriers who haven't confirmed PFA
 * status yet. Per piață RO 2026: plata la negru = 40M lei furt buget;
 * HIR are PFA/SRL ca politică implicită (vezi
 * [[decision-courier-pricing-zone-based-2026-05-22]]).
 *
 * Surface a single info card on the Earnings page, not a wizard — wizard
 * vine separat. Linkează la /dashboard/about/pfa cu pașii completi.
 */
type Props = {
  pfaStatus: 'unknown' | 'pending' | 'confirmed';
};

export function PfaInfoCard({ pfaStatus }: Props) {
  if (pfaStatus === 'confirmed') return null;

  return (
    <Card>
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30">
          <FileText className="h-5 w-5 text-amber-300" aria-hidden strokeWidth={2.25} />
        </span>
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-hir-fg">
            {pfaStatus === 'pending'
              ? 'PFA în curs de înregistrare'
              : 'Plata curată — deschide PFA'}
          </h3>
          <p className="mt-0.5 text-xs text-hir-muted-fg">
            HIR plătește pe factură către PFA-ul tău, nu cash. Avantaje: legal,
            predictibil, fără surprize fiscale.
          </p>
        </div>
      </header>

      {pfaStatus === 'pending' ? (
        <div className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-100 ring-1 ring-inset ring-amber-500/30">
          Ne-ai trimis actele. Verificăm și te confirmăm în 1-2 zile lucrătoare.
          Între timp poți lucra normal — primele plăți merg către contul personal.
        </div>
      ) : (
        <ul className="mt-3 space-y-1.5 text-xs text-hir-muted-fg">
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />
            <span>
              <strong className="text-hir-fg">Tu emiti factură</strong>, HIR plătește
              săptămânal prin transfer bancar.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />
            <span>
              CAS/CASS + impozit pe venit = ~10% din câștigul lunar (estimat). Vezi
              Calculator în Câștiguri.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />
            <span>
              Codul CAEN 5320 (curierat). Costuri înregistrare: ~70-150 lei la
              Registrul Comerțului.
            </span>
          </li>
        </ul>
      )}

      <Link
        href="/dashboard/about#pfa"
        className="mt-3 flex items-center justify-between rounded-lg bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/15"
      >
        <span>Vezi pașii compleți de înregistrare PFA</span>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </Card>
  );
}
