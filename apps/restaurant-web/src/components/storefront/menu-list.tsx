'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';
import type { MenuCategory } from '@/lib/menu';
import { t, type Locale } from '@/lib/i18n';
import { easeOutSoft, motionDurations, useShouldReduceMotion } from '@/lib/motion';
import { MenuItemCard } from './menu-item-card';
import { CategoryTabs } from './category-tabs';

// RSHIR-44: client-side search across the loaded menu. We keep all the data
// the server already shipped down (categories + items + modifiers) so the
// filter is instant — no extra round-trip. Categories without a match are
// hidden while the query is non-empty.

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    // strip combining diacritics so "supă" matches "supa"
    .replace(/[̀-ͯ]/g, '');
}

export function MenuList({
  categories,
  locale,
}: {
  categories: MenuCategory[];
  locale: Locale;
}) {
  const [query, setQuery] = useState('');
  const reduceMotion = useShouldReduceMotion();

  const filtered = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) return categories;
    const needle = normalize(trimmed);
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter((i) => {
          const name = normalize(i.name ?? '');
          const desc = normalize(i.description ?? '');
          return name.includes(needle) || desc.includes(needle);
        }),
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, query]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="relative px-4 pt-3">
        <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 transition-colors" />
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(locale, 'menu.search_placeholder')}
          aria-label={t(locale, 'menu.search_placeholder')}
          className="h-11 w-full rounded-full border border-zinc-200 bg-white pl-10 pr-10 text-sm shadow-sm transition-all focus:border-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-500/15"
        />
        <AnimatePresence>
          {query.length > 0 && (
            <motion.button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t(locale, 'menu.search_clear')}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, scale: 0.6 }}
              transition={{ duration: motionDurations.tap, ease: easeOutSoft }}
              className="absolute right-7 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-800"
            >
              <X className="h-3.5 w-3.5" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 px-4 text-center text-sm text-zinc-500">
          {t(locale, 'menu.search_no_results')}
        </p>
      ) : (
        <>
          {/* Hide the sticky tabs while the user is searching — the categories
              the bar shows would no longer match what's visible below. */}
          {query.trim().length === 0 && (
            <div className="mt-3 px-4">
              <CategoryTabs categories={filtered.map((c) => ({ id: c.id, name: c.name }))} locale={locale} />
            </div>
          )}

          <div className="px-4">
            <AnimatePresence mode="popLayout" initial={false}>
              {filtered.map((cat) => (
                <motion.section
                  key={cat.id}
                  id={`cat-${cat.id}`}
                  layout={!reduceMotion}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                  transition={{ duration: motionDurations.enter, ease: easeOutSoft }}
                  className="scroll-mt-20 pt-6"
                >
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl">
                      {cat.name}
                    </h2>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 tabular-nums">
                      {cat.items.length}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    {cat.items.map((it, idx) => (
                      <motion.div
                        key={it.id}
                        layout={!reduceMotion}
                        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: motionDurations.enter,
                          ease: easeOutSoft,
                          // Stagger items within a category so the eye
                          // tracks down naturally on first paint. Cap at 200ms
                          // so a 20-item category doesn't drag.
                          delay: Math.min(idx * 0.03, 0.2),
                        }}
                      >
                        <MenuItemCard
                          item={it}
                          modifiers={it.modifiers}
                          locale={locale}
                        />
                      </motion.div>
                    ))}
                  </div>
                </motion.section>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}
