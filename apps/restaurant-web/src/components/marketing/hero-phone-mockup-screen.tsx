'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Plus } from 'lucide-react';
import { useShouldReduceMotion } from '@/lib/motion';

// Client-side half of the hero phone mockup: cycles the "active" item and
// pops a brief "added to cart" toast, borrowing Boost Eat's animated-demo
// hero (their phone auto-scrolls the menu and shows a live add-to-cart
// toast). Data is fetched server-side by the parent and passed in as props
// — this component only owns the loop, never a network call, so it can
// never itself cause the homepage to 500 or block on Supabase.
//
// Respects prefers-reduced-motion: the cycle simply never starts, and the
// first item renders in its normal (non-active) state — same first-paint
// markup either way, so there's no layout shift from the check.

const CYCLE_MS = 2600;
const TOAST_MS = 1400;

type Item = { id: string; name: string; price_ron: number; image_url: string | null };

export function HeroPhoneMockupScreen({ items, addedLabel }: { items: Item[]; addedLabel: string }) {
  const reduceMotion = useShouldReduceMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (reduceMotion || items.length < 2) return;
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % items.length);
      setShowToast(true);
      const hide = setTimeout(() => setShowToast(false), TOAST_MS);
      return () => clearTimeout(hide);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [reduceMotion, items.length]);

  return (
    <div className="relative flex flex-col gap-1.5 px-3 pb-3">
      {items.map((item, i) => {
        const active = !reduceMotion && i === activeIndex;
        return (
          <motion.div
            key={item.id}
            animate={{
              scale: active ? 1.03 : 1,
              borderColor: active ? 'var(--hir-brand, #7c3aed)' : '#F1F5F9',
            }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2 rounded-lg border p-1.5"
            style={{ borderColor: '#F1F5F9' }}
          >
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.image_url}
                alt=""
                className="h-8 w-8 shrink-0 rounded-md bg-[#F1F5F9] object-cover"
              />
            ) : (
              <span className="h-8 w-8 shrink-0 rounded-md bg-[#F1F5F9]" aria-hidden />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10px] font-semibold text-[#0F172A]">
                {item.name}
              </span>
              <span className="block text-[10px] font-bold text-[#4F46E5]">
                {item.price_ron.toFixed(2)} lei
              </span>
            </span>
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold leading-none text-white"
              style={{ backgroundColor: active ? '#059669' : 'var(--hir-brand, #7c3aed)' }}
              aria-hidden
            >
              {active ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            </span>
          </motion.div>
        );
      })}

      <AnimatePresence>
        {showToast && !reduceMotion && (
          <motion.span
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#0F172A] px-2.5 py-1 text-[10px] font-medium text-white shadow-lg"
          >
            {addedLabel}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
