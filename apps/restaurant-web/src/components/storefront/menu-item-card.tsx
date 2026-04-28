'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Flame, Plus, Timer, UtensilsCrossed } from 'lucide-react';
import { ItemSheet } from './item-sheet';
import { useCart } from '@/lib/cart/provider';
import { formatRon } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';
import {
  easeOutSoft,
  motionDurations,
  subtlePulse,
  tapPress,
  useShouldReduceMotion,
} from '@/lib/motion';
import type { MenuItem, MenuItemWithModifiers } from '@/lib/menu';
import { servingInfoLine } from '@/lib/serving';

type Props = {
  item: MenuItem;
  modifiers?: MenuItemWithModifiers['modifiers'];
  locale: Locale;
};

// Row layout (Glovo / Wolt / UberEats style): text on the left, square image
// on the right. Tapping anywhere on the card opens the modifier sheet —
// EXCEPT the Add pill, which quick-adds when the item has no modifiers
// (saves a tap; on the QA conversion-friction list). Tapping Add on an
// item that does have modifiers still opens the sheet so required-or-
// optional choices land properly.
export function MenuItemCard({ item, modifiers = [], locale }: Props) {
  const [open, setOpen] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const useCartStore = useCart();
  const addItem = useCartStore((s) => s.addItem);
  const itemWithMods: MenuItemWithModifiers = { ...item, modifiers, modifierGroups: [] };
  const available = item.is_available;
  const hasModifiers = modifiers.length > 0;
  const reduceMotion = useShouldReduceMotion();

  useEffect(() => {
    if (!justAdded) return;
    const t = window.setTimeout(() => setJustAdded(false), 1200);
    return () => window.clearTimeout(t);
  }, [justAdded]);

  function handleCardClick() {
    if (!available) return;
    setOpen(true);
  }

  function handleAddClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!available) return;
    if (hasModifiers) {
      setOpen(true);
      return;
    }
    addItem({
      itemId: item.id,
      name: item.name,
      unitPriceRon: item.price_ron,
      imageUrl: item.image_url,
      modifiers: [],
    });
    setJustAdded(true);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (!available) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  }

  return (
    <>
      <motion.div
        role="button"
        tabIndex={available ? 0 : -1}
        onClick={handleCardClick}
        onKeyDown={handleKey}
        aria-label={item.name}
        aria-disabled={!available}
        whileHover={available && !reduceMotion ? { y: -2 } : undefined}
        transition={{ duration: motionDurations.tap, ease: easeOutSoft }}
        className={`group flex w-full items-stretch gap-3 rounded-2xl border border-zinc-200 bg-white p-3 text-left shadow-sm transition-shadow hover:border-zinc-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 ${
          available ? 'cursor-pointer' : 'opacity-70'
        }`}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {item.popular_rank !== null && available && (
            <motion.span
              animate={reduceMotion ? undefined : subtlePulse}
              className="inline-flex w-fit items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-800 ring-1 ring-inset ring-purple-200"
            >
              <Flame className="h-3 w-3" aria-hidden />
              {item.popular_rank === 1
                ? t(locale, 'item.popular_top')
                : t(locale, 'item.popular_rank_template', { rank: String(item.popular_rank) })}
            </motion.span>
          )}
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-900 sm:text-base">
            {item.name}
          </h3>
          {item.prep_minutes !== null && item.prep_minutes !== undefined ? (
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
              <Timer className="h-3 w-3" aria-hidden />
              {t(locale, 'item.prep_template', { minutes: String(item.prep_minutes) })}
            </span>
          ) : null}
          {item.description ? (
            <p className="line-clamp-2 text-xs leading-snug text-zinc-500 sm:text-sm">
              {item.description}
            </p>
          ) : null}
          <div className="mt-auto flex flex-col gap-0.5 pt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-base font-semibold tabular-nums text-zinc-900">
                {formatRon(item.price_ron, locale)}
              </span>
            {available ? (
              <motion.button
                type="button"
                onClick={handleAddClick}
                whileTap={reduceMotion ? undefined : tapPress}
                animate={
                  justAdded && !reduceMotion
                    ? { scale: [1, 1.08, 1] }
                    : undefined
                }
                transition={{ duration: motionDurations.tap, ease: easeOutSoft }}
                aria-label={
                  hasModifiers
                    ? t(locale, 'item.add_short')
                    : t(locale, 'item.add_to_cart')
                }
                className={`inline-flex h-9 items-center gap-1 rounded-full pl-2.5 pr-3 text-xs font-medium text-white shadow-sm transition-colors ${
                  justAdded
                    ? 'bg-emerald-600'
                    : 'bg-purple-700 group-hover:bg-purple-800 hover:bg-purple-800'
                }`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {justAdded ? (
                    <motion.span
                      key="added"
                      initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.85 }}
                      transition={{ duration: motionDurations.tap }}
                      className="inline-flex items-center gap-1"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {t(locale, 'item.added')}
                    </motion.span>
                  ) : (
                    <motion.span
                      key="add"
                      initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.85 }}
                      transition={{ duration: motionDurations.tap }}
                      className="inline-flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t(locale, 'item.add_short')}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            ) : (
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {t(locale, 'item.unavailable')}
              </span>
            )}
            </div>
            {(() => {
              const line = servingInfoLine(item, locale);
              return line ? (
                <span className="text-xs text-zinc-500">{line}</span>
              ) : null;
            })()}
          </div>
        </div>

        <div className="relative h-24 w-24 flex-none overflow-hidden rounded-xl bg-zinc-100 sm:h-28 sm:w-28">
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt={item.name}
              width={112}
              height={112}
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
            <>
              <div
                aria-hidden
                className="absolute inset-0 bg-white/55 backdrop-blur-[2px]"
              />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-900/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow-md">
                {t(locale, 'item.unavailable')}
              </span>
            </>
          ) : null}
        </div>
      </motion.div>

      {available && (
        <ItemSheet item={itemWithMods} open={open} onOpenChange={setOpen} locale={locale} />
      )}
    </>
  );
}
