import Link from 'next/link';
import { AlertTriangle, Package } from 'lucide-react';
import { getActiveTenant } from '@/lib/tenant';
import {
  isInventoryEnabled,
  listInventoryItems,
  listSuppliers,
} from '@/lib/inventory';
import { InventoryUpsell } from './upsell';
import { CreateItemForm } from './create-item-form';

export const dynamic = 'force-dynamic';

function fmtQty(n: number, unit: string): string {
  // Romanian decimal: comma. 3 decimals max but trim trailing zeros.
  const trimmed = Number.isInteger(n) ? n.toFixed(0) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${trimmed.replace('.', ',')} ${unit}`;
}

export default async function InventoryListPage({
  searchParams,
}: {
  searchParams?: { filter?: string };
}) {
  const { tenant } = await getActiveTenant();
  if (!(await isInventoryEnabled(tenant.id))) {
    return <InventoryUpsell />;
  }

  const [allItems, suppliers] = await Promise.all([
    listInventoryItems(tenant.id),
    listSuppliers(tenant.id),
  ]);

  // QW9 (UIUX audit 2026-05-08) — `?filter=low` deep-link from the home
  // dashboard low-stock pill. When set, hide the create-form + show only
  // rows where current_stock is at or below the reorder threshold.
  const lowOnly = searchParams?.filter === 'low';
  const lowStock = allItems.filter((i) => i.current_stock <= i.reorder_threshold && i.reorder_threshold > 0);
  const items = lowOnly ? lowStock : allItems;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            {lowOnly ? 'Stocuri pe terminate' : 'Stocuri'}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {lowOnly ? (
              <>
                {lowStock.length} ingredient{lowStock.length === 1 ? '' : 'e'} sub prag.{' '}
                <Link href="/dashboard/inventory" className="font-medium text-purple-700 hover:underline">
                  Vezi toate stocurile →
                </Link>
              </>
            ) : items.length === 0 ? (
              'Niciun ingredient adăugat încă.'
            ) : (
              `${items.length} ingredient${items.length === 1 ? '' : 'e'} urmărit${items.length === 1 ? '' : 'e'}.`
            )}
          </p>
        </div>
        <Link
          href="/dashboard/inventory/movements"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Jurnal mișcări
        </Link>
      </header>

      {lowStock.length > 0 ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600" aria-hidden />
            <div className="text-sm text-amber-900">
              <p className="font-medium">Stoc scăzut la {lowStock.length} ingredient{lowStock.length === 1 ? '' : 'e'}</p>
              <p className="mt-0.5 text-amber-700">
                Verificați și plasați comenzi către furnizori.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {!lowOnly && (
        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white">
          <header className="border-b border-zinc-200 px-5 py-4">
            <h2 className="text-sm font-medium text-zinc-900">Adăugați ingredient</h2>
          </header>
          <div className="p-5">
            <CreateItemForm suppliers={suppliers} />
          </div>
        </section>
      )}

      {items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
          <Package className="mx-auto h-7 w-7 text-zinc-400" aria-hidden />
          <p className="mt-3 text-sm font-medium text-zinc-900">
            {lowOnly ? 'Niciun stoc sub prag.' : 'Nicio intrare în stoc'}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            {lowOnly ? (
              <Link href="/dashboard/inventory" className="font-medium text-purple-700 hover:underline">
                Vezi toate stocurile →
              </Link>
            ) : (
              'Adăugați primul ingredient cu formularul de mai sus.'
            )}
          </p>
        </div>
      ) : (
        <section className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Ingredient</th>
                <th scope="col" className="px-4 py-3 font-medium">Stoc curent</th>
                <th scope="col" className="px-4 py-3 font-medium">Prag reaprovizionare</th>
                <th scope="col" className="px-4 py-3 font-medium">Acțiune</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {items.map((item) => {
                const isLow = item.reorder_threshold > 0 && item.current_stock <= item.reorder_threshold;
                return (
                  <tr key={item.id} className={isLow ? 'bg-amber-50/40' : undefined}>
                    <td className="px-4 py-3 font-medium text-zinc-900">{item.name}</td>
                    <td className={`px-4 py-3 ${isLow ? 'text-amber-700 font-medium' : 'text-zinc-700'}`}>
                      {fmtQty(item.current_stock, item.unit)}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {item.reorder_threshold > 0 ? fmtQty(item.reorder_threshold, item.unit) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/inventory/${item.id}`}
                        className="text-xs font-medium text-purple-700 hover:underline"
                      >
                        Detalii →
                      </Link>
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
