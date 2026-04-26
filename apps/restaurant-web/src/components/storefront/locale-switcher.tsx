'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import type { Locale } from '@/lib/i18n';
import { tapPress, useShouldReduceMotion } from '@/lib/motion';

const OPTIONS: Array<{ value: Locale; flag: string; label: string }> = [
  { value: 'ro', flag: '🇷🇴', label: 'RO' },
  { value: 'en', flag: '🇬🇧', label: 'EN' },
];

export function LocaleSwitcher({
  current,
  ariaLabel,
}: {
  current: Locale;
  ariaLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<Locale>(current);
  const reduceMotion = useShouldReduceMotion();

  function pick(next: Locale) {
    if (next === active || pending) return;
    setActive(next);
    startTransition(async () => {
      try {
        await fetch('/api/locale', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ locale: next }),
        });
      } finally {
        router.refresh();
      }
    });
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-full border border-zinc-200 bg-white p-0.5 text-xs shadow-sm"
    >
      {OPTIONS.map((opt) => {
        const selected = opt.value === active;
        return (
          <motion.button
            key={opt.value}
            type="button"
            onClick={() => pick(opt.value)}
            disabled={pending}
            aria-pressed={selected}
            whileTap={reduceMotion ? undefined : tapPress}
            className={`relative flex h-9 items-center gap-1 rounded-full px-3 font-medium transition-colors ${
              selected ? 'text-white' : 'text-zinc-600 hover:text-zinc-900'
            } disabled:opacity-60`}
          >
            {selected && (
              <motion.span
                layoutId="locale-active"
                className="absolute inset-0 rounded-full bg-zinc-900"
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 35,
                  duration: reduceMotion ? 0 : undefined,
                }}
              />
            )}
            <span aria-hidden className="relative">
              {opt.flag}
            </span>
            <span className="relative">{opt.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
