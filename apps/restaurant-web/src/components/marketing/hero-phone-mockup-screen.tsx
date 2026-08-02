'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Plus, ShoppingBag } from 'lucide-react';
import { useShouldReduceMotion } from '@/lib/motion';

// Client-side half of the hero phone mockup: cycles the "active" item and
// pops a brief "added to cart" toast, borrowing Boost Eat's animated-demo
// hero (their phone auto-scrolls the menu and shows a live add-to-cart
// toast). Data is fetched server-side by the parent and passed in as props
// — this component only owns the loop, never a network call, so it can
// never itself cause the homepage to 500 or block on Supabase.
//
// 2026-08-02 — the loop now actually fills a cart. Iulian: "la telefonul unde
// se adauga o comanda, un pas interactiv in animatie, de exemplu sa se vada ca
// apare in cos." A toast alone said an item *was* added; the bar below shows
// the running count and total climbing item by item, then resets and starts
// over. The bar is always mounted at a fixed height — the phone is absolutely
// positioned over the desktop screenshot, so a bar that appeared and
// disappeared would make the whole frame jump.
//
// Respects prefers-reduced-motion: the cycle simply never starts, the first
// item renders in its normal (non-active) state and the cart stays empty —
// same first-paint markup either way, so there's no layout shift from the
// check.

const CYCLE_MS = 2600;
const TOAST_MS = 1400;

type Item = { id: string; name: string; price_ron: number; image_url: string | null };

export function HeroPhoneMockupScreen({
  items,
  addedLabel,
  cartLabel,
  cartEmptyLabel,
}: {
  items: Item[];
  addedLabel: string;
  cartLabel: string;
  cartEmptyLabel: string;
}) {
  const reduceMotion = useShouldReduceMotion();
  const [step, setStep] = useState(0);
  const [showToast, setShowToast] = useState(false);

  // One beat per step, and everything on screen is derived from the step
  // number. The first version kept the index in a closure variable that the
  // interval mutated, and the loop drifted: after the cart reset it resumed at
  // the second item, so the first one was only ever added once. Derived state
  // can't drift — and it survives a remount without a shared timer ref.
  //
  // A cycle is one beat per item plus one more with the cart full, so the
  // total is readable instead of flashing past on its way back to zero.
  const cycleLen = items.length + 1;
  const phase = reduceMotion ? 0 : step % cycleLen;
  const cart = items.slice(0, phase);
  // The tick that puts an item in the cart is the same tick that ticks it
  // green, so the check, the toast and the counter always describe one action.
  const activeIndex = phase - 1;

  useEffect(() => {
    if (reduceMotion || items.length < 2) return;
    const id = setInterval(() => setStep((s) => s + 1), CYCLE_MS);
    return () => clearInterval(id);
  }, [reduceMotion, items.length]);

  // "Added to cart" fires on the beats that add something — not on the one
  // that empties the cart to start over.
  useEffect(() => {
    if (reduceMotion || step === 0 || step % cycleLen === 0) return;
    setShowToast(true);
    const id = setTimeout(() => setShowToast(false), TOAST_MS);
    return () => clearTimeout(id);
  }, [step, cycleLen, reduceMotion]);

  const total = cart.reduce((sum, it) => sum + it.price_ron, 0);

  return (
    <div className="flex flex-col">
      <div className="relative flex flex-col gap-1.5 px-3 pb-2">
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

      {/* Cart bar — the storefront's real one lives at the bottom of the
          screen too, so this is the pattern a visitor will recognise. */}
      <div className="px-3 pb-3" aria-hidden>
        <motion.div
          animate={{
            backgroundColor: cart.length > 0 ? '#0F172A' : '#F1F5F9',
          }}
          transition={{ duration: 0.25 }}
          className="flex items-center gap-2 rounded-lg px-2.5 py-2"
        >
          <span className="relative flex-none">
            <ShoppingBag
              className={`h-3.5 w-3.5 ${cart.length > 0 ? 'text-white' : 'text-[#94A3B8]'}`}
            />
            {/* Deliberately NOT wrapped in AnimatePresence: the exit animation
                kept the old badge on screen for ~200ms after the cart reset,
                so the counter still read "3" next to a 0,00 lei total. The
                `key` alone replays the pop on every increment, and unmounting
                is instant, so badge and total always agree. */}
            {cart.length > 0 && (
              <motion.span
                key={cart.length}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                className="absolute -right-1.5 -top-1.5 flex h-3 min-w-[0.75rem] items-center justify-center rounded-full bg-[#059669] px-0.5 text-[8px] font-bold leading-none text-white"
              >
                {cart.length}
              </motion.span>
            )}
          </span>
          <span
            className={`flex-1 truncate text-[9px] font-semibold ${
              cart.length > 0 ? 'text-white' : 'text-[#94A3B8]'
            }`}
          >
            {cart.length > 0 ? cartLabel : cartEmptyLabel}
          </span>
          <motion.span
            key={total}
            initial={cart.length > 0 ? { scale: 1.18 } : false}
            animate={{ scale: 1 }}
            transition={{ duration: 0.25 }}
            className={`flex-none text-[10px] font-bold tabular-nums ${
              cart.length > 0 ? 'text-white' : 'text-[#94A3B8]'
            }`}
          >
            {total.toFixed(2)} lei
          </motion.span>
        </motion.div>
      </div>
    </div>
  );
}
