import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getActiveTenant } from '@/lib/tenant';
import {
  getInventoryItem,
  isInventoryEnabled,
  listLinkableMenuItems,
  listMovements,
  listRecipesForItem,
  type MovementReason,
} from '@/lib/inventory';
import { InventoryUpsell } from '../upsell';
import { LinkRecipeForm } from './link-recipe-form';
import { UnlinkRecipeButton } from './unlink-recipe-button';
import { ManualAdjustForm } from './manual-adjust-form';

export const dynamic = 'force-dynamic';

function fmtQty(n: number, unit: string): string {
  const trimmed = Number.isInteger(n) ? n.toFixed(0) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${trimmed.replace('.', ',')} ${unit}`;
}

function fmtDelta(n: number, unit: string): string {
  const abs = Math.abs(n);
  const trimmed = Number.isInteger(abs)
    ? abs.toFixed(0)
    : abs.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${n > 0 ? '+' : '−'}${trimmed.replace('.', ',')} ${unit}`;
}

const REASON_LABELS_SHORT: Record<MovementReason, string> = {
  ORDER_DELIVERED: 'Comandă livrată',
  MANUAL_ADJUST: 'Ajustare manuală',
  PURCHASE_RECEIVED: 'Recepție',
  WASTE: 'Pierdere',
  INITIAL_STOCK: 'Stoc inițial',
};

export default async function InventoryItemDetailPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const { tenant } = await getActiveTenant();
  if (!(await isInventoryEnabled(tenant.id))) {
    return <InventoryUpsell />;
  }

  const item = await getInventoryItem(tenant.id, params.id);
  if (!item) notFound();

  const [recipes, recentMovements] = await Promise.all([
    listRecipesForItem(tenant.id, item.id),
    listMovements(tenant.id, { inventoryItemId: item.id, limit: 20 }),
  ]);
  const linkedMenuItemIds = recipes.map((r) => r.menu_item_id);
  const linkableMenuItems = await listLinkableMenuItems(tenant.id, linkedMenuItemIds);

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
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{item.name}</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Stoc curent: <span className="font-medium text-zinc-900">{fmtQty(item.current_stock, item.unit)}</span>
            {item.reorder_threshold > 0 ? (
              <span> · Prag: {fmtQty(item.reorder_threshold, item.unit)}</span>
            ) : null}
          </p>
        </div>
      </header>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white">
        <header className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-sm font-medium text-zinc-900">Rețete legate</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Produsele din meniu care consumă acest ingredient. Stocul se decrementează
            automat la fiecare comandă livrată (în lucru, PR următor).
          </p>
        </header>

        {recipes.length === 0 ? (
          <p data-testid="recipes-empty" className="px-5 py-6 text-sm text-zinc-500">
            Nicio rețetă definită pentru acest ingredient.
          </p>
        ) : (
          <ul data-testid="recipes-list" className="divide-y divide-zinc-100">
            {recipes.map((r) => (
              <li
                key={r.id}
                data-testid="recipe-row"
                data-menu-item-id={r.menu_item_id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-zinc-900">{r.menu_item_name ?? '(produs șters)'}</p>
                  <p className="text-xs text-zinc-500">
                    {fmtQty(r.qty_per_serving, item.unit)} per porție
                  </p>
                </div>
                <UnlinkRecipeButton recipeId={r.id} inventoryItemId={item.id} />
              </li>
            ))}
          </ul>
        )}

        {linkableMenuItems.length > 0 ? (
          <div className="border-t border-zinc-100 bg-zinc-50/50 px-5 py-4">
            <p className="text-xs font-medium text-zinc-700">Adăugați rețetă</p>
            <div className="mt-2.5">
              <LinkRecipeForm
                inventoryItemId={item.id}
                inventoryUnit={item.unit}
                linkableMenuItems={linkableMenuItems}
              />
            </div>
          </div>
        ) : (
          <div className="border-t border-zinc-100 bg-zinc-50/50 px-5 py-4 text-xs text-zinc-500">
            Toate produsele din meniu au deja o rețetă pentru acest ingredient.
          </div>
        )}
      </section>

      {/* Manual stock adjustment */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white">
        <header className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-sm font-medium text-zinc-900">Ajustare manuală stoc</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Folosiți pentru inventar fizic, pierderi sau corecții. Fiecare
            ajustare se înregistrează în jurnalul de mișcări.
          </p>
        </header>
        <div className="p-5">
          <ManualAdjustForm inventoryItemId={item.id} unit={item.unit} />
        </div>
      </section>

      {/* Recent movements */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white">
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-medium text-zinc-900">Mișcări recente</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Ultimele 20 de modificări pentru acest ingredient.
            </p>
          </div>
          <Link
            href="/dashboard/inventory/movements"
            className="text-xs font-medium text-purple-700 hover:underline"
          >
            Vezi tot jurnalul →
          </Link>
        </header>
        {recentMovements.length === 0 ? (
          <p data-testid="movements-empty" className="px-5 py-6 text-sm text-zinc-500">
            Nicio mișcare înregistrată pentru acest ingredient.
          </p>
        ) : (
          <ul data-testid="movements-list" className="divide-y divide-zinc-100">
            {recentMovements.map((m) => {
              const note =
                m.reason === 'MANUAL_ADJUST' && m.metadata && typeof m.metadata === 'object'
                  ? ((m.metadata as Record<string, unknown>).note as string | undefined)
                  : undefined;
              return (
                <li
                  key={m.id}
                  data-testid="movement-row"
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-700">
                      {REASON_LABELS_SHORT[m.reason]}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {new Date(m.created_at).toLocaleString('ro-RO')}
                    </p>
                    {note ? (
                      <p className="mt-0.5 text-xs text-zinc-600">{note}</p>
                    ) : null}
                  </div>
                  <span
                    className={`text-sm font-medium ${m.delta > 0 ? 'text-emerald-700' : 'text-zinc-900'}`}
                  >
                    {fmtDelta(m.delta, item.unit)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
