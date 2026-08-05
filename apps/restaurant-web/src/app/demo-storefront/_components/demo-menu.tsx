'use client';

import { useEffect, useRef, useState } from 'react';
import type { MenuCategory } from '@/lib/menu';
import { MenuItemCard } from '@/components/storefront/menu-item-card';
import { useDemoCartStore } from '@/lib/demo/demo-cart-store';
import {
  CATEGORY_TILE_BOX,
  CATEGORY_TILE_BUTTON,
  CategoryTileLabel,
  CategoryTileVisual,
} from '@/components/storefront/category-tile';
import type { Locale } from '@/lib/i18n';

// Category strip + item cards for the marketing-site demo storefront.
//
// Visually mirrors the real storefront (same icon/colour helpers as
// `category-tabs.tsx`, same card anatomy as the real menu list) so a visitor
// clicking through from hirforyou.ro sees what they'd actually get — but this
// stays a separate, self-contained component: it drives the isolated demo cart
// and can never touch a real order. Plain CSS transitions instead of the real
// storefront's framer-motion treatment; a demo doesn't need the extra weight.

export function DemoMenu({
  categories,
  locale,
}: {
  categories: MenuCategory[];
  locale: Locale;
}) {
  const addItem = useDemoCartStore((s) => s.addItem);
  const [activeId, setActiveId] = useState<string>(categories[0]?.id ?? '');
  const stripRef = useRef<HTMLDivElement>(null);

  // Scroll-spy: highlight whichever category section is topmost on screen.
  useEffect(() => {
    if (categories.length === 0) return;
    const sections = categories
      .map((c) => document.getElementById(`demo-cat-${c.id}`))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id.replace('demo-cat-', ''));
        }
      },
      { rootMargin: '-140px 0px -60% 0px', threshold: 0 },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [categories]);

  // Keep the active tile horizontally in view inside the scrolling strip.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const tile = strip.querySelector<HTMLElement>(`[data-tile="${activeId}"]`);
    if (tile) {
      strip.scrollTo({ left: tile.offsetLeft - strip.offsetLeft - 16, behavior: 'smooth' });
    }
  }, [activeId]);

  function jumpTo(id: string) {
    const el = document.getElementById(`demo-cat-${id}`);
    if (!el) return;
    setActiveId(id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (categories.length === 0) {
    return <p className="mt-8 text-sm text-zinc-500">Meniul demo nu este încă disponibil.</p>;
  }

  return (
    <>
      {categories.length > 1 && (
        <nav
          aria-label="Categorii"
          className="sticky top-[38px] z-30 -mx-4 mt-5 border-b border-zinc-200 bg-white/95 backdrop-blur"
        >
          <div
            ref={stripRef}
            className="no-scrollbar flex gap-3 overflow-x-auto px-4 py-3"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {categories.map((cat) => {
              const active = cat.id === activeId;
              return (
                <button
                  key={cat.id}
                  type="button"
                  data-tile={cat.id}
                  onClick={() => jumpTo(cat.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`${CATEGORY_TILE_BUTTON} active:scale-95`}
                >
                  <span className={CATEGORY_TILE_BOX}>
                    <CategoryTileVisual name={cat.name} active={active} />
                  </span>
                  <CategoryTileLabel name={cat.name} active={active} />
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <div className="mt-6 flex flex-col gap-7">
        {categories.map((cat) => (
          <section key={cat.id} id={`demo-cat-${cat.id}`} className="scroll-mt-32">
            <h2 className="mb-3 text-base font-bold tracking-tight text-zinc-900">{cat.name}</h2>
            <div className="flex flex-col gap-2.5">
              {/* The real storefront's card, not a copy of it (2026-08-03).
                  The demo used to render its own simplified card, which meant a
                  prospect never saw the popular badge, the prep time, the
                  serving size, the sold-out state — or, most expensively, the
                  options sheet: nothing in the demo suggested the product
                  supports per-item choices at all. MenuItemCard takes the cart
                  action as a prop now, so this passes the isolated demo store
                  and the two carts still cannot touch each other. */}
              {cat.items.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  modifiers={item.modifiers}
                  modifierGroups={item.modifierGroups}
                  locale={locale}
                  addItem={addItem}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
