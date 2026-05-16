'use client';

import { Children, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Small stagger-fade for list items (orders, earnings rows, history).
// Each direct child is wrapped in motion.li so the OrderListItem stays a
// plain server-render-friendly node. 40ms stagger / 220ms per item — fast
// enough that a list of 20 finishes inside 1s, slow enough to read as
// "items arrived" instead of "everything popped at once".
//
// `prefers-reduced-motion` returns a plain <ul> so OS-level reduce-motion
// users get an instant render.
export function StaggerList({
  children,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const reduce = useReducedMotion();
  const items = Children.toArray(children);

  if (reduce) {
    return (
      <ul className={className} aria-label={ariaLabel}>
        {items.map((child, i) => (
          <li key={i}>{child}</li>
        ))}
      </ul>
    );
  }

  return (
    <motion.ul
      className={className}
      aria-label={ariaLabel}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
      }}
    >
      {items.map((child, i) => (
        <motion.li
          key={i}
          variants={{
            hidden: { opacity: 0, y: 6 },
            show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
          }}
        >
          {child}
        </motion.li>
      ))}
    </motion.ul>
  );
}
