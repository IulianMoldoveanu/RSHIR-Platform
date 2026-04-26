'use client';
import { useState, useMemo } from 'react';
import { Minus, Plus, UtensilsCrossed } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@hir/ui';
import { useCart } from '@/lib/cart/provider';
import { formatRon } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';
import type { MenuItemWithModifiers } from '@/lib/menu';

type Props = {
  item: MenuItemWithModifiers;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
};

export function ItemSheet({ item, open, onOpenChange, locale }: Props) {
  const useCartStore = useCart();
  const addItem = useCartStore((s) => s.addItem);
  const [qty, setQty] = useState(1);
  const [selectedMods, setSelectedMods] = useState<Set<string>>(new Set());

  const modSum = useMemo(
    () =>
      item.modifiers
        .filter((m) => selectedMods.has(m.id))
        .reduce((s, m) => s + m.price_delta_ron, 0),
    [item.modifiers, selectedMods],
  );

  const lineTotal = (item.price_ron + modSum) * qty;

  function toggleMod(id: string) {
    setSelectedMods((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAdd() {
    addItem({
      itemId: item.id,
      name: item.name,
      unitPriceRon: item.price_ron,
      imageUrl: item.image_url,
      modifiers: item.modifiers.filter((m) => selectedMods.has(m.id)),
      qty,
    });
    onOpenChange(false);
    setQty(1);
    setSelectedMods(new Set());
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="sm:max-w-lg sm:rounded-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-h-[85vh] sm:border">
        {item.image_url ? (
          <div className="relative h-56 w-full overflow-hidden bg-zinc-100 sm:rounded-t-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.image_url}
              alt={item.name}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        ) : (
          <div className="flex h-32 w-full items-center justify-center bg-zinc-50 text-zinc-300 sm:rounded-t-2xl">
            <UtensilsCrossed className="h-12 w-12" aria-hidden />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 pt-4">
          <SheetHeader className="p-0 pb-3">
            <SheetTitle>{item.name}</SheetTitle>
            <p className="text-base font-medium text-zinc-900">{formatRon(item.price_ron, locale)}</p>
          </SheetHeader>

          {item.description ? (
            <p className="text-sm leading-relaxed text-zinc-600">{item.description}</p>
          ) : null}

          {item.modifiers.length > 0 ? (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {t(locale, 'item.modifiers_title')}
              </h3>
              <ul className="mt-2 space-y-1.5">
                {item.modifiers.map((m) => {
                  const checked = selectedMods.has(m.id);
                  return (
                    <li key={m.id}>
                      <label className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-200 px-3 py-2.5 hover:bg-zinc-50">
                        <span className="flex items-center gap-2.5 text-sm text-zinc-800">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMod(m.id)}
                            className="h-4 w-4 rounded border-zinc-300"
                          />
                          {m.name}
                        </span>
                        <span className="text-sm text-zinc-600">
                          +{formatRon(m.price_delta_ron, locale)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="mt-5 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-700">{t(locale, 'item.quantity')}</span>
            <div className="flex items-center gap-3 rounded-full bg-zinc-100 p-1">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm hover:text-zinc-900 disabled:opacity-50"
                disabled={qty <= 1}
                aria-label={t(locale, 'item.decrease_qty')}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-6 text-center text-base font-semibold tabular-nums">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm hover:text-zinc-900"
                aria-label={t(locale, 'item.increase_qty')}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <SheetFooter className="border-t-0">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!item.is_available}
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
            className="flex h-12 w-full items-center justify-between rounded-full bg-purple-700 px-5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-purple-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            <span>{item.is_available ? t(locale, 'item.add_to_cart') : t(locale, 'item.unavailable')}</span>
            {item.is_available ? <span className="tabular-nums">{formatRon(lineTotal, locale)}</span> : null}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
