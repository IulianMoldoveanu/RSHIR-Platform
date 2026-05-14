'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

/**
 * Pulse-on-change wrapper for the EarningsBar header pill.
 *
 * The bar itself is a server component (full DB read on every navigation),
 * which means the user only sees the *new* number when a route transition
 * completes — without a visual cue the change is easy to miss, especially
 * if the rider just delivered an order and the total ticked up by 1-2 RON.
 *
 * This client component keys a framer-motion `<motion.span>` on the value
 * so each new value gets a fresh mount with a brief scale + opacity pulse.
 * The very first render (initial hydration with the SSR'd value) is
 * suppressed via a ref-tracked first-render flag — we don't want the
 * pill to "wake up" with an animation every time the rider opens the app.
 */
export function EarningsValue({ value, count }: { value: number; count: number }) {
  const isFirstRender = useRef(true);
  useEffect(() => {
    isFirstRender.current = false;
  }, []);

  return (
    <>
      <motion.span
        key={value.toFixed(2)}
        initial={isFirstRender.current ? false : { scale: 0.92, opacity: 0.65 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="font-semibold text-zinc-100"
      >
        {value.toFixed(2)} RON
      </motion.span>
      <span className="text-zinc-500">
        · {count} {count === 1 ? 'livrare' : 'livrări'}
      </span>
    </>
  );
}
