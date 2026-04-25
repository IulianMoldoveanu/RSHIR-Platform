'use client';
import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useCart } from '@/lib/cart/provider';
import { formatRon } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';
import type { MenuItemWithModifiers } from '@/lib/menu';

export function ItemDetailActions({ item, locale }: { item: MenuItemWithModifiers; locale: Locale }) {
  const useCartStore = useCart();
  const addItem = useCartStore((s) => s.addItem);
  const [qty, setQty] = useState(1);
  const [selectedMods, setSelectedMods] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState(false);

  const modSum = item.modifiers
    .filter((m) => selectedMods.has(m.id))
    .reduce((s, m) => s + m.price_delta_ron, 0);
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
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div className="space-y-5">
      {item.modifiers.length > 0 ? (
        <div>
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
                    <span className="text-sm text-zinc-600">+{formatRon(m.price_delta_ron, locale)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700">{t(locale, 'item.quantity')}</span>
        <div className="flex items-center gap-3 rounded-full bg-zinc-100 p-1">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm disabled:opacity-50"
            disabled={qty <= 1}
            aria-label={t(locale, 'cart.decrease')}
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-6 text-center text-base font-semibold tabular-nums">{qty}</span>
          <button
            type="button"
            onClick={() => setQty((q) => q + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm"
            aria-label={t(locale, 'cart.increase')}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        disabled={!item.is_available}
        className="flex w-full items-center justify-between rounded-full bg-zinc-900 px-5 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
      >
        <span>
          {added
            ? t(locale, 'item.added')
            : item.is_available
              ? t(locale, 'item.add_to_cart')
              : t(locale, 'item.unavailable')}
        </span>
        {item.is_available ? <span className="tabular-nums">{formatRon(lineTotal, locale)}</span> : null}
      </button>
    </div>
  );
}
