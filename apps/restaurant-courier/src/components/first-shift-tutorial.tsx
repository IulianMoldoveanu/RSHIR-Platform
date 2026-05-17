'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, ArrowDown, ArrowUp } from 'lucide-react';
import * as haptics from '@/lib/haptics';

const TUTORIAL_KEY = 'hir-courier-first-shift-done';

type Step = {
  id: string;
  title: string;
  body: string;
  /**
   * Where the highlighted arrow points relative to the overlay.
   * 'bottom' = pointing down toward the bottom nav.
   * 'top'    = pointing up toward an order card area.
   * 'none'   = no directional arrow.
   */
  arrow: 'bottom' | 'top' | 'none';
  arrowLabel?: string;
};

// Copy uses the "tu" register (matches welcome carousel + pilot
// feedback). Each step is one tip, no bullet lists — overlay is shown
// once at first-shift start so brevity matters.
const STEPS: Step[] = [
  {
    id: 'swipe',
    title: 'Glisează pentru a confirma',
    body: 'Glisează butonul violet pentru a confirma ridicarea sau livrarea. Protecție contra atingerilor accidentale — o simplă apăsare nu declanșează nimic.',
    arrow: 'none',
  },
  {
    id: 'order-card',
    title: 'Acceptă rapid — sub 15 secunde',
    body: 'Când apare o comandă disponibilă, telefonul vibrează. Ai puțin timp pentru a accepta; altfel oferta merge la alt curier.',
    arrow: 'top',
    arrowLabel: 'Aici apar comenzile',
  },
  {
    id: 'earnings',
    title: 'Câștiguri în timp real',
    body: 'Apasă „Câștiguri" din bara de jos pentru a vedea sumele acumulate, actualizate imediat după fiecare livrare.',
    arrow: 'bottom',
    arrowLabel: 'Bara de navigație',
  },
];

/**
 * Full-screen tutorial overlay shown once after a courier's first
 * shift start. Steps through 3 contextual hints. Dismissed permanently
 * via LocalStorage. Does NOT block any action — a permanent close (X)
 * is always visible top-right.
 *
 * Visual: matches the welcome carousel's hero treatment (per-step dot
 * indicator + same CTA / Sari peste pattern + tu register).
 */
export function FirstShiftTutorial() {
  const [visible, setVisible] = useState<boolean | null>(null);
  const [step, setStep] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    try {
      const flag = localStorage.getItem(TUTORIAL_KEY);
      setVisible(flag !== '1');
    } catch {
      setVisible(false);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(TUTORIAL_KEY, '1');
    } catch {
      /* silent */
    }
    setVisible(false);
  }

  function advance() {
    haptics.tap();
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }

  if (visible === null) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const overlayVariants = prefersReducedMotion
    ? { initial: {}, animate: {}, exit: {} }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };

  const cardVariants = prefersReducedMotion
    ? { initial: {}, animate: {}, exit: {} }
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -16 },
      };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="tutorial-overlay"
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2 }}
          // z-[1900]: below welcome carousel (2000) but above app header (1100)
          className="fixed inset-0 z-[1900] flex flex-col items-center justify-center bg-zinc-950/85 px-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Tutorial: pasul ${step + 1} din ${STEPS.length}`}
        >
          {/* Permanent close. */}
          <button
            type="button"
            aria-label="Închide tutorialul"
            onClick={dismiss}
            className="absolute right-4 top-4 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>

          {/* Progress text top-center — explicit "1 din 3" so the user
              knows what's left without parsing the dot widths. */}
          <p className="absolute top-6 text-xs font-medium tabular-nums text-zinc-500">
            {step + 1} din {STEPS.length}
          </p>

          {/* Arrow indicator — top half of screen. */}
          {current.arrow === 'top' && (
            <motion.div
              key={`arrow-top-${step}`}
              initial={prefersReducedMotion ? {} : { opacity: 0, y: -8 }}
              animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="absolute top-20 flex flex-col items-center gap-1 text-violet-300"
            >
              <ArrowUp className="h-6 w-6 animate-bounce" aria-hidden />
              <span className="text-[11px] font-semibold uppercase tracking-wide">
                {current.arrowLabel ?? ''}
              </span>
            </motion.div>
          )}

          {/* Arrow indicator — bottom of screen toward nav. */}
          {current.arrow === 'bottom' && (
            <motion.div
              key={`arrow-bottom-${step}`}
              initial={prefersReducedMotion ? {} : { opacity: 0, y: 8 }}
              animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="absolute bottom-20 flex flex-col items-center gap-1 text-violet-300"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide">
                {current.arrowLabel ?? ''}
              </span>
              <ArrowDown className="h-6 w-6 animate-bounce" aria-hidden />
            </motion.div>
          )}

          {/* Card. */}
          <div className="w-full max-w-sm">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                variants={cardVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
                className="rounded-3xl border border-violet-500/30 bg-gradient-to-br from-violet-950/60 to-zinc-900 p-6 shadow-2xl shadow-black/40"
              >
                <h2 className="mb-2 text-xl font-bold tracking-tight text-zinc-100">
                  {current.title}
                </h2>
                <p className="text-sm leading-relaxed text-zinc-400">{current.body}</p>

                {/* Dot indicators — matches welcome carousel widths. */}
                <div
                  className="mt-6 flex items-center gap-2"
                  role="tablist"
                  aria-label="Pas curent"
                >
                  {STEPS.map((_, i) => (
                    <span
                      key={i}
                      role="tab"
                      aria-selected={i === step}
                      className={`h-2 rounded-full transition-all ${
                        i === step ? 'w-8 bg-violet-500' : 'w-2 bg-zinc-700'
                      }`}
                    />
                  ))}
                </div>

                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={advance}
                    className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition-all hover:bg-violet-500 hover:shadow-violet-500/40 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2"
                  >
                    {isLast ? 'Gata, pornesc' : 'Continuă'}
                  </button>
                  <button
                    type="button"
                    onClick={dismiss}
                    className="flex min-h-[48px] items-center justify-center rounded-xl border border-zinc-700 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
                  >
                    Sari peste
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
