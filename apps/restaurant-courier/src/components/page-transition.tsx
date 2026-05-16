'use client';

import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

// Subtle page transition: 8px upward fade-in keyed by pathname. The motion
// is intentionally tiny — couriers navigate under physical load (in mers,
// in lift, one hand on the bag) and large slides cost more than they help.
// `prefers-reduced-motion` is honored: returns children verbatim, no
// AnimatePresence wrapper, so OS-level reduced-motion users see zero
// transform. The dashboard root (force-dynamic) is the only place this
// renders; auth + login routes stay vanilla.
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  if (reduce) return <>{children}</>;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
