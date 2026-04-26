'use client';

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { MenuCategory } from '@/lib/menu';
import { t, type Locale } from '@/lib/i18n';
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
        <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(locale, 'menu.search_placeholder')}
          aria-label={t(locale, 'menu.search_placeholder')}
          className="h-10 w-full rounded-full border border-zinc-200 bg-white pl-10 pr-10 text-sm shadow-sm focus:border-purple-600 focus:outline-none"
        />
        {query.length > 0 ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t(locale, 'menu.search_clear')}
            className="absolute right-7 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
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
              <CategoryTabs categories={filtered.map((c) => ({ id: c.id, name: c.name }))} />
            </div>
          )}

          <div className="px-4">
            {filtered.map((cat) => (
              <section
                key={cat.id}
                id={`cat-${cat.id}`}
                className="scroll-mt-20 pt-6"
              >
                <h2 className="text-base font-semibold tracking-tight text-zinc-900 sm:text-lg">
                  {cat.name}
                </h2>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  {cat.items.map((it) => (
                    <MenuItemCard
                      key={it.id}
                      item={it}
                      modifiers={it.modifiers}
                      locale={locale}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
