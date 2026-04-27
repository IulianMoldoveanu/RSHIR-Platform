'use client';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, UtensilsCrossed } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@hir/ui';
import { useCart } from '@/lib/cart/provider';
import { formatRon } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';
import {
  easeOutSoft,
  motionDurations,
  tapPress,
  useShouldReduceMotion,
} from '@/lib/motion';
import type { MenuItemWithModifiers, MenuModifier, MenuModifierGroup } from '@/lib/menu';

type Props = {
  item: MenuItemWithModifiers;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
};

export function ItemSheet({ item, open, onOpenChange, locale }: Props) {
  const useCartStore = useCart();
  const addItem = useCartStore((s) => s.addItem);
  const reduceMotion = useShouldReduceMotion();
  const [qty, setQty] = useState(1);
  // selectedByGroup: groupId → Set<modifierId>. Required groups need the
  // user to pick at least select_min before the CTA enables.
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({});
  // selectedUngrouped: legacy ungrouped modifiers — multi-select checkbox.
  const [selectedUngrouped, setSelectedUngrouped] = useState<Set<string>>(new Set());

  // Required-first ordering: groups whose select_min ≥ 1 sort to the top.
  // Tie-break by sort_order. Optional groups follow.
  const orderedGroups = useMemo(() => {
    return [...item.modifierGroups].sort((a, b) => {
      const aReq = a.selectMin >= 1 ? 0 : 1;
      const bReq = b.selectMin >= 1 ? 0 : 1;
      if (aReq !== bReq) return aReq - bReq;
      return a.sortOrder - b.sortOrder;
    });
  }, [item.modifierGroups]);

  // Pre-select first option of single-choice required groups when sheet
  // opens — Wolt convention. Means the CTA is enabled the moment the
  // sheet shows up.
  useEffect(() => {
    if (!open) return;
    const initial: Record<string, string[]> = {};
    for (const g of item.modifierGroups) {
      if (g.selectMin >= 1 && g.selectMax === 1 && g.options[0]) {
        initial[g.id] = [g.options[0].id];
      }
    }
    setSelectedByGroup(initial);
    setSelectedUngrouped(new Set());
    setQty(1);
  }, [open, item.id, item.modifierGroups]);

  // Validation: every required group must have ≥ selectMin selected,
  // every group must have ≤ selectMax selected (NULL = unlimited).
  const groupValidation = useMemo(() => {
    const unmet: MenuModifierGroup[] = [];
    for (const g of item.modifierGroups) {
      const count = (selectedByGroup[g.id] ?? []).length;
      if (count < g.selectMin) unmet.push(g);
    }
    return { unmet, allSatisfied: unmet.length === 0 };
  }, [item.modifierGroups, selectedByGroup]);

  // Resolve selected modifier objects (for pricing + cart payload).
  const selectedModifiers = useMemo(() => {
    const out: MenuModifier[] = [];
    for (const g of item.modifierGroups) {
      const ids = selectedByGroup[g.id] ?? [];
      for (const id of ids) {
        const opt = g.options.find((o) => o.id === id);
        if (opt) out.push(opt);
      }
    }
    for (const m of item.modifiers) {
      if (selectedUngrouped.has(m.id)) out.push(m);
    }
    return out;
  }, [item.modifierGroups, item.modifiers, selectedByGroup, selectedUngrouped]);

  const modSum = useMemo(
    () => selectedModifiers.reduce((s, m) => s + m.price_delta_ron, 0),
    [selectedModifiers],
  );
  const lineTotal = (item.price_ron + modSum) * qty;

  function toggleGroupOption(group: MenuModifierGroup, optionId: string) {
    setSelectedByGroup((prev) => {
      const current = prev[group.id] ?? [];
      const isSelected = current.includes(optionId);
      // Single-choice (radio) — replace.
      if (group.selectMax === 1) {
        return { ...prev, [group.id]: isSelected ? [] : [optionId] };
      }
      // Multi-choice — toggle, but cap at selectMax.
      if (isSelected) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      }
      if (group.selectMax !== null && current.length >= group.selectMax) {
        return prev; // at max, refuse to add
      }
      return { ...prev, [group.id]: [...current, optionId] };
    });
  }

  function toggleUngrouped(id: string) {
    setSelectedUngrouped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAdd() {
    if (!groupValidation.allSatisfied) return;
    addItem({
      itemId: item.id,
      name: item.name,
      unitPriceRon: item.price_ron,
      imageUrl: item.image_url,
      modifiers: selectedModifiers,
    });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="sm:max-w-lg sm:rounded-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-h-[85vh] sm:border"
      >
        {item.image_url ? (
          <div className="relative h-56 w-full overflow-hidden bg-zinc-100 sm:rounded-t-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.image_url}
              alt={item.name}
              width={672}
              height={224}
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

          {/* Required-first groups */}
          {orderedGroups.map((group) => (
            <GroupSection
              key={group.id}
              group={group}
              selected={selectedByGroup[group.id] ?? []}
              onToggle={(optionId) => toggleGroupOption(group, optionId)}
              locale={locale}
              reduceMotion={reduceMotion}
            />
          ))}

          {/* Legacy ungrouped optional modifiers */}
          {item.modifiers.length > 0 ? (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {t(locale, 'item.modifiers_title')}
              </h3>
              <ul className="mt-2 space-y-1.5">
                {item.modifiers.map((m) => {
                  const checked = selectedUngrouped.has(m.id);
                  return (
                    <li key={m.id}>
                      <label className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-200 px-3 py-2.5 transition-colors hover:bg-zinc-50">
                        <span className="flex items-center gap-2.5 text-sm text-zinc-800">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleUngrouped(m.id)}
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
              <motion.button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                whileTap={reduceMotion ? undefined : tapPress}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm hover:text-zinc-900 disabled:opacity-50"
                disabled={qty <= 1}
                aria-label={t(locale, 'item.decrease_qty')}
              >
                <Minus className="h-4 w-4" />
              </motion.button>
              <span className="w-6 text-center text-base font-semibold tabular-nums">{qty}</span>
              <motion.button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                whileTap={reduceMotion ? undefined : tapPress}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm hover:text-zinc-900"
                aria-label={t(locale, 'item.increase_qty')}
              >
                <Plus className="h-4 w-4" />
              </motion.button>
            </div>
          </div>
        </div>

        <SheetFooter className="border-t-0">
          <motion.button
            type="button"
            onClick={handleAdd}
            disabled={!item.is_available || !groupValidation.allSatisfied}
            whileTap={
              !item.is_available || !groupValidation.allSatisfied || reduceMotion
                ? undefined
                : tapPress
            }
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
            className="flex h-12 w-full items-center justify-between rounded-full bg-purple-700 px-5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-purple-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            <span>
              {!item.is_available
                ? t(locale, 'item.unavailable')
                : !groupValidation.allSatisfied
                  ? t(locale, 'item.select_required', {
                      group: groupValidation.unmet[0]?.name ?? '',
                    })
                  : t(locale, 'item.add_to_cart')}
            </span>
            {item.is_available && groupValidation.allSatisfied ? (
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={lineTotal}
                  initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: 6 }}
                  transition={{ duration: motionDurations.tap, ease: easeOutSoft }}
                  className="tabular-nums"
                >
                  {formatRon(lineTotal, locale)}
                </motion.span>
              </AnimatePresence>
            ) : null}
          </motion.button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function GroupSection({
  group,
  selected,
  onToggle,
  locale,
  reduceMotion,
}: {
  group: MenuModifierGroup;
  selected: string[];
  onToggle: (optionId: string) => void;
  locale: Locale;
  reduceMotion: boolean;
}) {
  const required = group.selectMin >= 1;
  const single = group.selectMax === 1;
  const constraint = required
    ? single
      ? t(locale, 'item.group_required_single')
      : group.selectMax === null
        ? t(locale, 'item.group_required_min_template', { min: String(group.selectMin) })
        : t(locale, 'item.group_required_range_template', {
            min: String(group.selectMin),
            max: String(group.selectMax),
          })
    : single
      ? t(locale, 'item.group_optional_single')
      : group.selectMax === null
        ? t(locale, 'item.group_optional')
        : t(locale, 'item.group_optional_max_template', { max: String(group.selectMax) });

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">{group.name}</h3>
        {required && (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
            {t(locale, 'item.required_label')}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">{constraint}</p>
      <ul className="mt-2 space-y-1.5">
        {group.options.map((opt) => {
          const isSelected = selected.includes(opt.id);
          return (
            <li key={opt.id}>
              <motion.label
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                transition={{ duration: motionDurations.tap, ease: easeOutSoft }}
                className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
                  isSelected
                    ? 'border-purple-600 bg-purple-50 ring-1 ring-purple-200'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50'
                }`}
              >
                <span className="flex items-center gap-2.5 text-sm text-zinc-800">
                  <input
                    type={single ? 'radio' : 'checkbox'}
                    name={`group-${group.id}`}
                    checked={isSelected}
                    onChange={() => onToggle(opt.id)}
                    className="h-4 w-4 rounded border-zinc-300 text-purple-600 focus:ring-purple-500"
                  />
                  {opt.name}
                </span>
                {opt.price_delta_ron !== 0 && (
                  <span className="text-sm font-medium text-zinc-700 tabular-nums">
                    {opt.price_delta_ron > 0 ? '+' : ''}
                    {formatRon(opt.price_delta_ron, locale)}
                  </span>
                )}
              </motion.label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
