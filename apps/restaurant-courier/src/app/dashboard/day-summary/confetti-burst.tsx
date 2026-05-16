'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { custom as hapticCustom } from '@/lib/haptics';

/**
 * Tiny confetti burst that fires once on mount via framer-motion.
 * Uses 12 small particles that fly outward from the centre of the screen
 * and fade out — no third-party confetti lib needed.
 */

const PARTICLES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * 2 * Math.PI;
  const distance = 80 + Math.random() * 60;
  return {
    id: i,
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    color: i % 3 === 0 ? '#8b5cf6' : i % 3 === 1 ? '#10b981' : '#f59e0b',
    size: 6 + Math.round(Math.random() * 4),
    delay: i * 0.04,
  };
});

export function ConfettiBurst() {
  useEffect(() => {
    hapticCustom([30, 50, 30, 50, 60]);
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-0 flex items-center justify-center"
      aria-hidden
    >
      {PARTICLES.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{ width: p.size, height: p.size, background: p.color }}
          initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          animate={{ opacity: 0, x: p.x, y: p.y, scale: 0.4 }}
          transition={{ duration: 0.9, delay: p.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}
