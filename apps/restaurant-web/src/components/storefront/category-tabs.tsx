'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { t, type Locale } from '@/lib/i18n';
import { motionDurations, tapPress, useShouldReduceMotion } from '@/lib/motion';

// Sticky horizontal tab bar. Tapping a chip smooth-scrolls the page to the
// matching <section id="cat-{id}">. As the user scrolls, an IntersectionObserver
// updates the active chip so it always reflects what's on screen, then we
// auto-scroll the chip strip horizontally so the active chip stays visible.
//
// Mounted by MenuList only when there are ≥2 categories visible (single-
// category menus don't need the bar — gives extra real estate back).

export function CategoryTabs({
  categories,
  locale,
}: {
  categories: Array<{ id: string; name: string }>;
  locale: Locale;
}) {
  const [activeId, setActiveId] = useState<string>(categories[0]?.id ?? '');
  const stripRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useShouldReduceMotion();

  useEffect(() => {
    if (categories.length === 0) return;
    const sections = categories
      .map((c) => document.getElementById(`cat-${c.id}`))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the topmost intersecting section. rootMargin is set so the bar
        // itself doesn't trigger spurious matches.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = visible[0].target.id.replace('cat-', '');
          setActiveId(id);
        }
      },
      { rootMargin: '-72px 0px -60% 0px', threshold: 0 },
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [categories]);

  // Keep the active chip horizontally in view inside the strip.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const chip = strip.querySelector<HTMLElement>(`[data-chip="${activeId}"]`);
    if (chip) {
      const left = chip.offsetLeft - strip.offsetLeft - 16;
      strip.scrollTo({ left, behavior: 'smooth' });
    }
  }, [activeId]);

  function jumpTo(id: string) {
    const el = document.getElementById(`cat-${id}`);
    if (!el) return;
    setActiveId(id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (categories.length < 2) return null;

  return (
    <nav
      aria-label={t(locale, 'menu.aria_categories')}
      className="sticky top-0 z-20 -mx-4 border-b border-zinc-200 bg-white/95 backdrop-blur"
    >
      <div
        ref={stripRef}
        className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {categories.map((c) => {
          const active = c.id === activeId;
          return (
            <motion.button
              key={c.id}
              type="button"
              data-chip={c.id}
              onClick={() => jumpTo(c.id)}
              whileTap={reduceMotion ? undefined : tapPress}
              transition={{ duration: motionDurations.tap }}
              aria-current={active ? 'true' : undefined}
              className={`relative shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? 'text-white' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {/* Sliding active background — Wolt-style. layoutId means
                  the same DOM node is reused across chips and framer
                  morphs position+size smoothly. The inactive bg is a
                  separate static layer so the strip's empty state still
                  has visible chip outlines. */}
              {active ? (
                <motion.span
                  layoutId="category-tab-active"
                  className="absolute inset-0 rounded-full bg-zinc-900"
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 35,
                    duration: reduceMotion ? 0 : undefined,
                  }}
                />
              ) : (
                <span aria-hidden className="absolute inset-0 rounded-full bg-zinc-100" />
              )}
              <span className="relative">{c.name}</span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
