'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { MenuCategory } from '@/lib/menu';
import { useDemoCartStore } from '@/lib/demo/demo-cart-store';
import { iconForCategory, tileColorForCategory } from '@/components/storefront/category-icon';

// Category strip + item cards for the marketing-site demo storefront.
//
// Visually mirrors the real storefront (same icon/colour helpers as
// `category-tabs.tsx`, same card anatomy as the real menu list) so a visitor
// clicking through from hirforyou.ro sees what they'd actually get — but this
// stays a separate, self-contained component: it drives the isolated demo cart
// and can never touch a real order. Plain CSS transitions instead of the real
// storefront's framer-motion treatment; a demo doesn't need the extra weight.

export function DemoMenu({ categories }: { categories: MenuCategory[] }) {
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
              const Icon = iconForCategory(cat.name);
              const [tileBg, tileFg] = tileColorForCategory(cat.name).split(' ');
              return (
                <button
                  key={cat.id}
                  type="button"
                  data-tile={cat.id}
                  onClick={() => jumpTo(cat.id)}
                  aria-current={active ? 'true' : undefined}
                  className="flex w-16 shrink-0 flex-col items-center gap-1 active:scale-95 transition-transform"
                >
                  <span
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${
                      active ? '' : tileBg
                    }`}
                    style={active ? { backgroundColor: 'var(--hir-brand, #7c3aed)' } : undefined}
                  >
                    <Icon
                      className={`h-6 w-6 transition-colors ${active ? 'text-white' : tileFg}`}
                      aria-hidden
                    />
                  </span>
                  <span
                    className={`line-clamp-2 text-center text-[11px] font-medium leading-tight transition-colors ${
                      active ? 'text-zinc-900' : 'text-zinc-600'
                    }`}
                  >
                    {cat.name}
                  </span>
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
              {cat.items.map((item) => {
                const Icon = iconForCategory(cat.name);
                const [tileBg, tileFg] = tileColorForCategory(cat.name).split(' ');
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-2.5 transition-shadow hover:shadow-md"
                  >
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt=""
                        loading="lazy"
                        className="h-20 w-20 shrink-0 rounded-xl bg-zinc-100 object-cover"
                      />
                    ) : (
                      // No photo on this item — fall back to the category glyph
                      // rather than a broken/empty box.
                      <span
                        className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-xl ${tileBg}`}
                        aria-hidden
                      >
                        <Icon className={`h-7 w-7 ${tileFg}`} />
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight text-zinc-900">{item.name}</p>
                      {item.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-zinc-500">
                          {item.description}
                        </p>
                      )}
                      <p className="mt-1.5 text-sm font-bold text-[var(--hir-brand)]">
                        {item.price_ron.toFixed(2)} lei
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        addItem({
                          itemId: item.id,
                          name: item.name,
                          unitPriceRon: item.price_ron,
                          imageUrl: item.image_url,
                          modifiers: [],
                        })
                      }
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--hir-brand)] text-white shadow-sm transition-transform active:scale-90"
                      aria-label={`Adaugă ${item.name} în coș`}
                    >
                      <Plus className="h-5 w-5" aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
