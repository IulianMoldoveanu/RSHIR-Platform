'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Locale } from '@/lib/i18n';

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
          <button
            key={opt.value}
            type="button"
            onClick={() => pick(opt.value)}
            disabled={pending}
            aria-pressed={selected}
            className={`flex h-7 items-center gap-1 rounded-full px-2 font-medium transition-colors ${
              selected
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-600 hover:text-zinc-900'
            } disabled:opacity-60`}
          >
            <span aria-hidden>{opt.flag}</span>
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
