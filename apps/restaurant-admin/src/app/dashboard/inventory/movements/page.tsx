import Link from 'next/link';
import { ArrowLeft, History } from 'lucide-react';
import { getActiveTenant } from '@/lib/tenant';
import { isInventoryEnabled } from '@/lib/inventory';
import { InventoryUpsell } from '../upsell';

export const dynamic = 'force-dynamic';

/**
 * Placeholder page for inventory_movements ledger.
 *
 * The movements table is created by migration 20260506_013, but no movements
 * are written until PR 3a (DELIVERED stock-deplete trigger). This page
 * surfaces "în lucru" state to OWNERs who navigate here from the list page.
 *
 * Keep the route alive so the list page link remains valid; the real ledger
 * UI ships in PR 3b alongside the trigger.
 */
export default async function InventoryMovementsPage() {
  const { tenant } = await getActiveTenant();
  if (!(await isInventoryEnabled(tenant.id))) {
    return <InventoryUpsell />;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/dashboard/inventory"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Înapoi la stocuri
      </Link>

      <header className="mt-3">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Jurnal mișcări stoc</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Istoric al modificărilor de stoc — comenzi livrate, ajustări manuale, recepții.
        </p>
      </header>

      <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
        <History className="mx-auto h-7 w-7 text-zinc-400" aria-hidden />
        <p className="mt-3 text-sm font-medium text-zinc-900">În lucru</p>
        <p className="mt-1 text-sm text-zinc-600">
          Decrementarea automată la livrare se activează în versiunea următoare a modulului.
          Până atunci, jurnalul rămâne gol.
        </p>
      </div>
    </div>
  );
}
