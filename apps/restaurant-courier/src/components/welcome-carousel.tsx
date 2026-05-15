'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronRight, Truck, PackageCheck, Wallet, X } from 'lucide-react';
import * as haptics from '@/lib/haptics';

const ONBOARDED_KEY = 'hir-courier-onboarded';

type Screen = {
  icon: React.ReactNode;
  title: string;
  body: string;
};

const SCREENS: Screen[] = [
  {
    icon: <Truck className="h-16 w-16 text-violet-400" aria-hidden />,
    title: 'Bun venit la HIR Curier!',
    body: 'Aplicația dumneavoastră pentru gestionarea livrărilor — rapid, simplu, de pe orice telefon.',
  },
  {
    icon: <PackageCheck className="h-16 w-16 text-emerald-400" aria-hidden />,
    title: 'Acceptați, ridicați, livrați',
    body: 'Acceptați comenzi, ridicați coletul de la restaurant sau farmacie, livrați-l clientului și primiți banii direct în cont.',
  },
  {
    icon: <Wallet className="h-16 w-16 text-amber-400" aria-hidden />,
    title: 'Hai să pornim primul dumneavoastră shift!',
    body: 'Totul e la un swipe distanță. Deschideți tura și comenzile vor veni automat.',
  },
];

/**
 * Full-screen welcome carousel shown once to first-time couriers.
 * Detection via localStorage flag `hir-courier-onboarded`.
 * Disappears permanently after the courier presses "Începe" or "Sari".
 */
export function WelcomeCarousel() {
  const [visible, setVisible] = useState<boolean | null>(null);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const prefersReducedMotion = useReducedMotion();
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const flag = localStorage.getItem(ONBOARDED_KEY);
      setVisible(flag !== '1');
    } catch {
      // Private mode — skip carousel silently.
      setVisible(false);
    }
  }, []);

  // Move focus to the "Începe" button when the last screen appears.
  useEffect(() => {
    if (index === SCREENS.length - 1) {
      startRef.current?.focus();
    }
  }, [index]);

  function dismiss() {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1');
    } catch {
      /* silent */
    }
    setVisible(false);
  }

  function next() {
    haptics.tap();
    if (index < SCREENS.length - 1) {
      setDirection(1);
      setIndex((i) => i + 1);
    } else {
      dismiss();
    }
  }

  // null = still reading localStorage; avoid hydration flash
  if (visible === null) return null;

  const isLast = index === SCREENS.length - 1;
  const screen = SCREENS[index];

  const variants = prefersReducedMotion
    ? {
        enter: () => ({}),
        center: {},
        exit: () => ({}),
      }
    : {
        enter: (dir: number) => ({ opacity: 0, x: dir * 60 }),
        center: { opacity: 1, x: 0 },
        exit: (dir: number) => ({ opacity: 0, x: -dir * 60 }),
      };

  return (
    // AnimatePresence wraps the boolean check so exit animation plays
    // before the overlay unmounts from the DOM.
    <AnimatePresence>
      {visible && (
        <motion.div
          key="welcome-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          // Overlay sits above header (z-[1100]) and everything else.
          role="dialog"
          aria-modal="true"
          aria-label="Bun venit la HIR Curier"
          className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-zinc-950/95 px-6"
        >
          {/* Skip button — always accessible. */}
          <button
            type="button"
            aria-label="Sari peste introducere"
            onClick={dismiss}
            className="absolute right-4 top-4 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-zinc-500 hover:text-zinc-300 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>

          {/* Animated screen content. */}
          <div className="w-full max-w-sm">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={index}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex flex-col items-center gap-6 text-center"
              >
                {/* Illustration placeholder — icon scaled to 128×128 touch-friendly area. */}
                <div
                  aria-hidden
                  className="flex h-32 w-32 items-center justify-center rounded-3xl bg-zinc-800/60"
                >
                  {screen.icon}
                </div>

                <div className="space-y-2">
                  <h1 className="text-xl font-bold text-zinc-100">{screen.title}</h1>
                  <p className="text-sm leading-relaxed text-zinc-400">{screen.body}</p>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Dot indicators. */}
            <div
              className="mt-10 flex items-center justify-center gap-2"
              role="tablist"
              aria-label="Ecran curent"
            >
              {SCREENS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Ecranul ${i + 1} din ${SCREENS.length}`}
                  onClick={() => {
                    setDirection(i > index ? 1 : -1);
                    setIndex(i);
                    haptics.tap();
                  }}
                  className={`h-2 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2 ${
                    i === index ? 'w-6 bg-violet-500' : 'w-2 bg-zinc-700 hover:bg-zinc-500'
                  }`}
                />
              ))}
            </div>

            {/* Primary CTA. */}
            <div className="mt-6 flex flex-col gap-3">
              <button
                ref={isLast ? startRef : undefined}
                type="button"
                onClick={next}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white hover:bg-violet-500 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2"
              >
                {isLast ? (
                  'Începe'
                ) : (
                  <>
                    Înainte
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </>
                )}
              </button>

              {!isLast && (
                <button
                  type="button"
                  onClick={dismiss}
                  className="min-h-[44px] w-full rounded-2xl px-6 py-3 text-sm text-zinc-500 hover:text-zinc-300 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
                >
                  Sari
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
