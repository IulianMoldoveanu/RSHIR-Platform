// Lane INVENTORY-FOLLOWUP PR 3b (2026-05-07) — replaces the "în lucru"
// placeholder with the real inventory_movements ledger UI.
//
// Reads up to 100 latest movements for the active tenant, joined with
// inventory_items (name + unit) so the UI does not need a second round
// trip. Supports a `reason` filter via query string, mirroring how the
// audit-log surface lets OWNERs scope the view.

import Link from 'next/link';
import { ArrowLeft, History } from 'lucide-react';
import { getActiveTenant } from '@/lib/tenant';
import {
  isInventoryEnabled,
  listMovements,
  type MovementReason,
} from '@/lib/inventory';
import { InventoryUpsell } from '../upsell';

export const dynamic = 'force-dynamic';

const REASON_LABELS: Record<MovementReason, string> = {
  ORDER_DELIVERED: 'Comandă livrată',
  MANUAL_ADJUST: 'Ajustare manuală',
  PURCHASE_RECEIVED: 'Recepție furnizor',
  WASTE: 'Pierdere',
  INITIAL_STOCK: 'Stoc inițial',
};

const REASON_TONE: Record<MovementReason, string> = {
  ORDER_DELIVERED: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  MANUAL_ADJUST: 'bg-purple-50 text-purple-800 ring-purple-200',
  PURCHASE_RECEIVED: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  WASTE: 'bg-amber-50 text-amber-900 ring-amber-200',
  INITIAL_STOCK: 'bg-blue-50 text-blue-800 ring-blue-200',
};

const REASON_FILTERS: Array<{ value: '' | MovementReason; label: string }> = [
  { value: '', label: 'Toate' },
  { value: 'ORDER_DELIVERED', label: 'Comenzi livrate' },
  { value: 'MANUAL_ADJUST', label: 'Ajustări manuale' },
  { value: 'PURCHASE_RECEIVED', label: 'Recepții' },
  { value: 'WASTE', label: 'Pierderi' },
  { value: 'INITIAL_STOCK', label: 'Stoc inițial' },
];

function fmtDelta(delta: number, unit: string | null): string {
  const abs = Math.abs(delta);
  const trimmed = Number.isInteger(abs)
    ? abs.toFixed(0)
    : abs.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${trimmed.replace('.', ',')}${unit ? ` ${unit}` : ''}`;
}

export default async function InventoryMovementsPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  const { tenant } = await getActiveTenant();
  if (!(await isInventoryEnabled(tenant.id))) {
    return <InventoryUpsell />;
  }

  // Parse + validate the reason filter from the URL.
  const reasonParam = (searchParams?.reason ?? '').toUpperCase() as MovementReason | '';
  const validReasons = REASON_FILTERS.map((r) => r.value).filter(Boolean) as MovementReason[];
  const reason = validReasons.includes(reasonParam as MovementReason)
    ? (reasonParam as MovementReason)
    : null;

  const rows = await listMovements(tenant.id, { reason, limit: 100 });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link
        href="/dashboard/inventory"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Înapoi la stocuri
      </Link>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Jurnal mișcări stoc</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Ultimele 100 de modificări — comenzi livrate, ajustări manuale și recepții.
          </p>
        </div>
      </header>

      {/* Reason filter pills */}
      <nav
        aria-label="Filtru motiv"
        className="mt-5 flex flex-wrap gap-1.5"
      >
        {REASON_FILTERS.map((f) => {
          const isActive =
            (f.value === '' && !reason) || f.value === reason;
          const href = f.value
            ? `/dashboard/inventory/movements?reason=${f.value}`
            : '/dashboard/inventory/movements';
          return (
            <Link
              key={f.value || 'all'}
              href={href}
              className={[
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                isActive
                  ? 'bg-zinc-900 text-white ring-zinc-900'
                  : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50',
              ].join(' ')}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
          <History className="mx-auto h-7 w-7 text-zinc-400" aria-hidden />
          <p className="mt-3 text-sm font-medium text-zinc-900">Nicio mișcare înregistrată</p>
          <p className="mt-1 text-sm text-zinc-600">
            Mișcările apar automat la fiecare comandă livrată sau la ajustarea manuală a stocului.
          </p>
        </div>
      ) : (
        <section className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Data</th>
                <th scope="col" className="px-4 py-3 font-medium">Ingredient</th>
                <th scope="col" className="px-4 py-3 font-medium">Motiv</th>
                <th scope="col" className="px-4 py-3 font-medium">Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((m) => {
                const note =
                  m.reason === 'MANUAL_ADJUST' && m.metadata && typeof m.metadata === 'object'
                    ? ((m.metadata as Record<string, unknown>).note as string | undefined)
                    : undefined;
                const isNegative = m.delta < 0;
                return (
                  <tr key={m.id} data-testid="movement-row">
                    <td className="px-4 py-3 text-xs text-zinc-600 whitespace-nowrap">
                      {new Date(m.created_at).toLocaleString('ro-RO')}
                    </td>
                    <td className="px-4 py-3 text-zinc-900">
                      {m.inventory_item_name ?? <span className="text-zinc-400">(șters)</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${REASON_TONE[m.reason]}`}
                      >
                        {REASON_LABELS[m.reason]}
                      </span>
                      {note ? (
                        <p className="mt-1 text-xs text-zinc-500">{note}</p>
                      ) : null}
                      {m.order_id ? (
                        <p className="mt-1 font-mono text-[11px] text-zinc-400">
                          comandă: {m.order_id.slice(0, 8)}
                        </p>
                      ) : null}
                    </td>
                    <td
                      className={`px-4 py-3 font-medium ${isNegative ? 'text-zinc-900' : 'text-emerald-700'}`}
                    >
                      {fmtDelta(m.delta, m.inventory_item_unit ?? null)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
