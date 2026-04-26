'use client';
import { useState } from 'react';
import { Plus, UtensilsCrossed } from 'lucide-react';
import { ItemSheet } from './item-sheet';
import { formatRon } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';
import type { MenuItem, MenuItemWithModifiers } from '@/lib/menu';

type Props = {
  item: MenuItem;
  modifiers?: MenuItemWithModifiers['modifiers'];
  locale: Locale;
};

// Row layout (Glovo / Wolt / UberEats style): text on the left, square image
// on the right. Replaces the previous 260px-wide horizontally-scrolling card
// — see docs/UI_UX_AUDIT.md §1.
export function MenuItemCard({ item, modifiers = [], locale }: Props) {
  const [open, setOpen] = useState(false);
  const itemWithMods: MenuItemWithModifiers = { ...item, modifiers };
  const available = item.is_available;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!available}
        aria-label={item.name}
        className="group flex w-full items-stretch gap-3 rounded-2xl border border-zinc-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md disabled:cursor-default disabled:opacity-70 disabled:hover:shadow-sm"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-900 sm:text-base">
            {item.name}
          </h3>
          {item.description ? (
            <p className="line-clamp-2 text-xs leading-snug text-zinc-500 sm:text-sm">
              {item.description}
            </p>
          ) : null}
          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
            <span className="text-base font-semibold tabular-nums text-zinc-900">
              {formatRon(item.price_ron, locale)}
            </span>
            {available ? (
              <span className="inline-flex h-8 items-center gap-1 rounded-full bg-purple-700 pl-2.5 pr-3 text-xs font-medium text-white shadow-sm transition-colors group-hover:bg-purple-800">
                <Plus className="h-3.5 w-3.5" />
                {t(locale, 'item.add_short')}
              </span>
            ) : (
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {t(locale, 'item.unavailable')}
              </span>
            )}
          </div>
        </div>

        <div className="relative h-24 w-24 flex-none overflow-hidden rounded-xl bg-zinc-100 sm:h-28 sm:w-28">
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt={item.name}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-300">
              <UtensilsCrossed className="h-8 w-8" aria-hidden />
            </div>
          )}
          {!available ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/75 text-[10px] font-semibold uppercase tracking-wider text-zinc-700">
              {t(locale, 'item.unavailable')}
            </div>
          ) : null}
        </div>
      </button>

      {available && (
        <ItemSheet item={itemWithMods} open={open} onOpenChange={setOpen} locale={locale} />
      )}
    </>
  );
}
