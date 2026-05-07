import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getActiveTenant } from '@/lib/tenant';
import {
  getInventoryItem,
  isInventoryEnabled,
  listLinkableMenuItems,
  listRecipesForItem,
} from '@/lib/inventory';
import { InventoryUpsell } from '../upsell';
import { LinkRecipeForm } from './link-recipe-form';
import { UnlinkRecipeButton } from './unlink-recipe-button';

export const dynamic = 'force-dynamic';

function fmtQty(n: number, unit: string): string {
  const trimmed = Number.isInteger(n) ? n.toFixed(0) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${trimmed.replace('.', ',')} ${unit}`;
}

export default async function InventoryItemDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { tenant } = await getActiveTenant();
  if (!(await isInventoryEnabled(tenant.id))) {
    return <InventoryUpsell />;
  }

  const item = await getInventoryItem(tenant.id, params.id);
  if (!item) notFound();

  const recipes = await listRecipesForItem(tenant.id, item.id);
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
    </div>
  );
}
