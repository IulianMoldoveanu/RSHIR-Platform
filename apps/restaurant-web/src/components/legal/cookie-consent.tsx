'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Locale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import { CONSENT_COOKIE, type ConsentValue, isConsent } from '@/lib/consent';
import { easeOutSoft, motionDurations, useShouldReduceMotion } from '@/lib/motion';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

export function CookieConsent({ locale }: { locale: Locale }) {
  const [visible, setVisible] = useState(false);
  const [pending, startTransition] = useTransition();
  const reduceMotion = useShouldReduceMotion();

  useEffect(() => {
    const existing = readCookie(CONSENT_COOKIE);
    if (!isConsent(existing)) setVisible(true);
  }, []);

  function pick(value: ConsentValue) {
    if (pending) return;
    startTransition(async () => {
      try {
        await fetch('/api/consent', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value }),
        });
      } finally {
        setVisible(false);
      }
    });
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-live="polite"
          aria-label={t(locale, 'consent.banner_text')}
          initial={reduceMotion ? false : { y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduceMotion ? undefined : { y: 100, opacity: 0 }}
          transition={{ duration: motionDurations.sheet, ease: easeOutSoft }}
          className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 backdrop-blur shadow-lg"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-relaxed text-zinc-700">
              {t(locale, 'consent.banner_text')}{' '}
              <Link
                href="/privacy"
                className="font-medium text-zinc-900 underline underline-offset-2 hover:text-purple-700"
              >
                {t(locale, 'consent.privacy_link')}
              </Link>
              .
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => pick('essential')}
                disabled={pending}
                className="h-10 rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60"
              >
                {t(locale, 'consent.essential_only')}
              </button>
              <button
                type="button"
                onClick={() => pick('all')}
                disabled={pending}
                className="h-10 rounded-full bg-zinc-900 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:scale-[1.02] hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-60 motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
              >
                {t(locale, 'consent.accept_all')}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
