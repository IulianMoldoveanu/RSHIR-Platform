'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Locale } from '@/lib/i18n';
import { useShouldReduceMotion } from '@/lib/motion';

const OPTIONS: Array<{ value: Locale; flag: string; label: string }> = [
  { value: 'ro', flag: '🇷🇴', label: 'Română' },
  { value: 'en', flag: '🇬🇧', label: 'English' },
];

// Flag-only trigger + dropdown, mirroring the flag-icon pattern used by
// larger delivery sites (MaPizza etc.) — compact on the cover photo, and
// scales cleanly once more locales are activated (RESERVED_LOCALES in
// lib/i18n/index.ts) without needing a wider toggle-pill redesign.
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
  const [open, setOpen] = useState(false);
  const reduceMotion = useShouldReduceMotion();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  function pick(next: Locale) {
    setOpen(false);
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

  const activeOpt = OPTIONS.find((o) => o.value === active) ?? OPTIONS[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-base shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-60"
      >
        <span aria-hidden>{activeOpt.flag}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label={ariaLabel}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-11 z-20 min-w-[140px] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg"
          >
            {OPTIONS.map((opt) => {
              const selected = opt.value === active;
              return (
                <li key={opt.value} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => pick(opt.value)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      selected ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <span aria-hidden className="text-base">{opt.flag}</span>
                    <span>{opt.label}</span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
