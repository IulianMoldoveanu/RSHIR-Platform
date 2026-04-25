'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ItemSheet } from './item-sheet';
import { formatRon } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';
import type { MenuItem, MenuItemWithModifiers } from '@/lib/menu';

type Props = {
  item: MenuItem;
  modifiers?: MenuItemWithModifiers['modifiers'];
  locale: Locale;
};

export function MenuItemCard({ item, modifiers = [], locale }: Props) {
  const [open, setOpen] = useState(false);
  const itemWithMods: MenuItemWithModifiers = { ...item, modifiers };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative flex w-[260px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-sm transition-shadow hover:shadow-md"
      >
        <div className="relative h-36 w-full overflow-hidden bg-zinc-100">
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt={item.name}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl">🍽️</div>
          )}
          {!item.is_available ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/75 text-xs font-semibold uppercase tracking-wider text-zinc-700">
              {t(locale, 'item.unavailable')}
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-1 p-3">
          <h3 className="line-clamp-1 text-sm font-semibold text-zinc-900">{item.name}</h3>
          {item.description ? (
            <p className="line-clamp-2 text-xs leading-snug text-zinc-500">{item.description}</p>
          ) : null}
          <div className="mt-auto flex items-center justify-between pt-2">
            <span className="text-sm font-semibold tabular-nums text-zinc-900">
              {formatRon(item.price_ron, locale)}
            </span>
            {item.is_available ? (
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-zinc-900 pl-2 pr-2.5 text-xs font-medium text-white">
                <Plus className="h-3 w-3" />
                {t(locale, 'item.add_short')}
              </span>
            ) : null}
          </div>
        </div>
      </button>

      <ItemSheet item={itemWithMods} open={open} onOpenChange={setOpen} locale={locale} />
    </>
  );
}
