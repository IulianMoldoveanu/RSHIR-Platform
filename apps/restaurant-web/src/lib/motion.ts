'use client';
// Shared motion primitives for the storefront. Centralised so micro-
// animations stay coherent across surfaces (cart, sheet, badges,
// threshold bar, add-to-cart button) and so we can globally tune
// duration / easing without chasing every callsite.
//
// All variants honour prefers-reduced-motion via the `useShouldReduceMotion`
// hook below — components default to no animation when the OS is asking
// for less. WCAG 2.3.3 compliance.

import { useReducedMotion } from 'framer-motion';

export const easeOutSoft = [0.22, 1, 0.36, 1] as const;
export const easeInOutSoft = [0.4, 0, 0.2, 1] as const;

export const motionDurations = {
  /** Quick tap response — buttons, chips. */
  tap: 0.12,
  /** Element entrance / list item insert. */
  enter: 0.22,
  /** Sheet / dialog slide-up. */
  sheet: 0.28,
  /** Hero / parallax. */
  hero: 0.45,
} as const;

/** Standard "fade + lift" entrance, used for cards / sections. */
export const fadeLift = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: motionDurations.enter, ease: easeOutSoft },
  },
};

/** Cart-drawer / sheet pop. */
export const sheetPop = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: motionDurations.sheet, ease: easeOutSoft },
  },
};

/** Tap-press feedback. Apply with `whileTap`. */
export const tapPress = { scale: 0.96 };

/** Button hover lift. Apply with `whileHover`. */
export const hoverLift = { y: -1 };

/** Repeated subtle pulse for "popular" / "live" badges. */
export const subtlePulse = {
  scale: [1, 1.04, 1],
  transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' as const },
};

/**
 * Hook that returns true when the OS is asking for reduced motion. Use
 * this to skip animations entirely:
 *   const reduce = useShouldReduceMotion();
 *   <motion.div animate={reduce ? undefined : visible} ... />
 */
export function useShouldReduceMotion(): boolean {
  return useReducedMotion() ?? false;
}
