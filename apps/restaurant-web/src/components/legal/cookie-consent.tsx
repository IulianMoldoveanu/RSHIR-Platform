'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import type { Locale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import { CONSENT_COOKIE, type ConsentValue, isConsent } from '@/lib/consent';

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

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t(locale, 'consent.banner_text')}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white shadow-lg"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-700">
          {t(locale, 'consent.banner_text')}{' '}
          <Link href="/privacy" className="underline text-zinc-900">
            {t(locale, 'consent.privacy_link')}
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => pick('essential')}
            disabled={pending}
            className="h-9 rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            {t(locale, 'consent.essential_only')}
          </button>
          <button
            type="button"
            onClick={() => pick('all')}
            disabled={pending}
            className="h-9 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {t(locale, 'consent.accept_all')}
          </button>
        </div>
      </div>
    </div>
  );
}
