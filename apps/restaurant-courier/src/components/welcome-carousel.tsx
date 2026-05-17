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
  tone: 'violet' | 'emerald' | 'amber';
};

// Tone-per-screen so the carousel reads as three distinct beats
// instead of three identical cards. Each screen's accent matches the
// icon color: welcome=violet (brand), action=emerald (do), reward=amber
// (earn). Same convention used in the bottom-nav + StopCard.
const SCREENS: Screen[] = [
  {
    icon: <Truck className="h-16 w-16 text-violet-300" aria-hidden />,
    title: 'Bun venit la HIR Curier',
    body: 'Aplicația ta pentru livrări — rapidă, simplă, de pe orice telefon. Te ajutăm să câștigi mai mult cu mai puțină bătaie de cap.',
    tone: 'violet',
  },
  {
    icon: <PackageCheck className="h-16 w-16 text-emerald-300" aria-hidden />,
    title: 'Acceptă, ridică, livrează',
    body: 'Acceptă o comandă cu un swipe, ridică pachetul de la restaurant sau farmacie și livrează-l clientului. Trei pași, fără surprize.',
    tone: 'emerald',
  },
  {
    icon: <Wallet className="h-16 w-16 text-amber-300" aria-hidden />,
    title: 'Pornește prima ta tură',
    body: 'Tu deschizi tura, comenzile vin automat. Câștigurile se actualizează în timp real, plata se face direct în cont.',
    tone: 'amber',
  },
];

const TONE_CLASSES: Record<Screen['tone'], { glow: string; chip: string; ring: string }> = {
  violet: {
    glow: 'from-violet-500/25 via-zinc-950 to-zinc-950',
    chip: 'bg-violet-500/15 ring-violet-500/30',
    ring: 'ring-violet-500/20',
  },
  emerald: {
    glow: 'from-emerald-500/25 via-zinc-950 to-zinc-950',
    chip: 'bg-emerald-500/15 ring-emerald-500/30',
    ring: 'ring-emerald-500/20',
  },
  amber: {
    glow: 'from-amber-500/25 via-zinc-950 to-zinc-950',
    chip: 'bg-amber-500/15 ring-amber-500/30',
    ring: 'ring-amber-500/20',
  },
};

/**
 * Full-screen welcome carousel shown once to first-time couriers.
 * Detection via LocalStorage flag `hir-courier-onboarded`.
 * Disappears permanently after the courier presses "Începe" or "Sari".
 *
 * Tone shifts per screen (violet -> emerald -> amber) so the three
 * beats feel distinct. Tone "tu" instead of "dumneavoastră" - friendlier
 * register the courier crowd prefers per pilot feedback.
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

  if (visible === null) return null;

  const isLast = index === SCREENS.length - 1;
  const screen = SCREENS[index];
  const tone = TONE_CLASSES[screen.tone];

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
    <AnimatePresence>
      {visible && (
        <motion.div
          key="welcome-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label="Bun venit la HIR Curier"
          className={`fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-gradient-to-b ${tone.glow} px-6 transition-colors duration-300`}
        >
          {/* Skip button — always accessible top-right. */}
          <button
            type="button"
            aria-label="Sari peste introducere"
            onClick={dismiss}
            className="absolute right-4 top-4 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>

          {/* Progress text top-center — explicit "1 din 3" so the user
              knows what's left without parsing the dot widths. */}
          <p className="absolute top-6 text-xs font-medium tabular-nums text-zinc-500">
            {index + 1} din {SCREENS.length}
          </p>

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
                className="flex flex-col items-center gap-7 text-center"
              >
                <div
                  aria-hidden
                  className={`flex h-36 w-36 items-center justify-center rounded-[2rem] ring-1 ${tone.chip} ${tone.ring} shadow-2xl shadow-black/40`}
                >
                  {screen.icon}
                </div>

                <div className="space-y-3">
                  <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
                    {screen.title}
                  </h1>
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
                    i === index ? 'w-8 bg-violet-500' : 'w-2 bg-zinc-700 hover:bg-zinc-500'
                  }`}
                />
              ))}
            </div>

            {/* Primary CTA. */}
            <div className="mt-6 flex flex-col gap-2">
              <button
                ref={isLast ? startRef : undefined}
                type="button"
                onClick={next}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition-all hover:bg-violet-500 hover:shadow-violet-500/40 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2"
              >
                {isLast ? (
                  'Începe acum'
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
                  className="min-h-[44px] w-full rounded-2xl px-6 py-3 text-sm text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
                >
                  Sari peste
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
