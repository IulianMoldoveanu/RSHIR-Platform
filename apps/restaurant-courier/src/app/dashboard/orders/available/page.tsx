import { MapPinned } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';

// decision_pull_dispatch_eliminated_2026-08-04: this page used to browse the
// open pool (unassigned CREATED/OFFERED orders in the rider's fleet) with
// self-pickup — that was the pull mechanism, now removed for every rider
// mode (previously only Mode C was gated out here). Orders are assigned via
// AUTOMAT (offer_courier_order / fn_auto_dispatch_sweep) or MANUAL
// (dispatcher assigns); riders see them under "Comenzile mele" on
// /dashboard/orders once directed.
export default function AvailablePoolPage() {
  return (
    <div className="mx-auto max-w-xl">
      <EmptyState
        icon={<MapPinned className="h-5 w-5" aria-hidden />}
        title="Pool indisponibil"
        hint="Comenzile îți sunt asignate automat sau de dispecer."
        ctaHref="/dashboard/orders"
        ctaLabel="Vezi comenzile mele"
      />
    </div>
  );
}
