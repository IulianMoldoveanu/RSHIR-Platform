'use client';

import { useState } from 'react';
import { Plus, RotateCcw, UtensilsCrossed } from 'lucide-react';
import { ItemSheet } from './item-sheet';
import { formatRon } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';
import type { MenuItemWithModifiers } from '@/lib/menu';

// Conversion B13. Returning customers (cookie-recognized) see a horizontal
// rail of items they've ordered before, above the menu. Baymard's grocery /
// food-delivery research is explicit: returning users seek "Buy it again"
// above the fold; rendering it as a carousel beats forcing them through the
// full menu. We open the same ItemSheet so modifiers re-confirm — the user
// gets one tap to a familiar order without bypassing required choices.

export function ReorderRail({
  items,
  locale,
}: {
  items: MenuItemWithModifiers[];
  locale: Locale;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (items.length === 0) return null;
  const open = items.find((i) => i.id === openId) ?? null;

  return (
    <section className="px-4 pt-4">
      <div className="mb-2 flex items-center gap-2">
        <RotateCcw className="h-4 w-4 text-zinc-500" aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
          {t(locale, 'reorder.rail_title')}
        </h2>
      </div>
      <div
        className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpenId(item.id)}
            aria-label={item.name}
            className="group flex w-36 flex-none flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-2 text-left shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="relative h-24 w-full overflow-hidden rounded-xl bg-zinc-100">
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-zinc-300">
                  <UtensilsCrossed className="h-7 w-7" aria-hidden />
                </div>
              )}
            </div>
            <p className="line-clamp-2 text-xs font-medium leading-tight text-zinc-900">
              {item.name}
            </p>
            <div className="mt-auto flex items-center justify-between">
              <span className="text-xs font-semibold tabular-nums text-zinc-900">
                {formatRon(item.price_ron, locale)}
              </span>
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-purple-700 px-2 text-[11px] font-medium text-white shadow-sm transition-colors group-hover:bg-purple-800">
                <Plus className="h-3 w-3" />
                {t(locale, 'item.add_short')}
              </span>
            </div>
          </button>
        ))}
      </div>

      {open && (
        <ItemSheet
          item={open}
          open={openId === open.id}
          onOpenChange={(v) => {
            if (!v) setOpenId(null);
          }}
          locale={locale}
        />
      )}
    </section>
  );
}
