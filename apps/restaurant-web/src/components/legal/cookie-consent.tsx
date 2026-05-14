'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Locale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import {
  ALL_RECORD,
  CONSENT_COOKIE,
  CONSENT_LOCALSTORAGE_KEY,
  ESSENTIAL_RECORD,
  isExpired,
  parseConsent,
  type ConsentRecord,
} from '@/lib/consent';
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

function readLocalStorage(): ConsentRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_LOCALSTORAGE_KEY);
    return parseConsent(raw);
  } catch {
    return null;
  }
}

function writeLocalStorage(record: ConsentRecord): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CONSENT_LOCALSTORAGE_KEY,
      JSON.stringify(record),
    );
  } catch {
    // Quota / private mode — cookie is the source of truth, localStorage is
    // only a faster client-side mirror so we swallow.
  }
}

type Choice = 'all' | 'essential' | 'custom';

export function CookieConsent({ locale }: { locale: Locale }) {
  const [visible, setVisible] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [pending, startTransition] = useTransition();
  const reduceMotion = useShouldReduceMotion();

  // Decide visibility on mount: show banner if no record, or expired record
  // (>12 months old). Cookie wins over localStorage because the SSR pixel-
  // gating reads the cookie; we still mirror to localStorage on save.
  useEffect(() => {
    const fromCookie = parseConsent(readCookie(CONSENT_COOKIE));
    const fromStorage = readLocalStorage();
    const record = fromCookie ?? fromStorage;
    if (!record || isExpired(record)) {
      setVisible(true);
    } else {
      // Pre-fill the modal toggles with the stored preferences in case the
      // user re-opens via a future "manage preferences" link.
      setAnalytics(record.analytics);
      setMarketing(record.marketing);
    }
  }, []);

  const save = useCallback(
    (choice: Choice) => {
      if (pending) return;
      const record: ConsentRecord =
        choice === 'all'
          ? { ...ALL_RECORD, ts: Date.now() }
          : choice === 'essential'
            ? { ...ESSENTIAL_RECORD, ts: Date.now() }
            : {
                v: 1,
                essential: true,
                analytics,
                marketing,
                ts: Date.now(),
              };

      // Mirror immediately so the next page nav sees the localStorage record
      // even if the API call is in flight.
      writeLocalStorage(record);

      startTransition(async () => {
        try {
          await fetch('/api/consent', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              analytics: record.analytics,
              marketing: record.marketing,
            }),
          });
        } finally {
          setShowCustomize(false);
          setVisible(false);
        }
      });
    },
    [analytics, marketing, pending],
  );

  const headingId = useMemo(
    () => `hir-consent-heading-${Math.random().toString(36).slice(2, 8)}`,
    [],
  );

  if (!visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            role="dialog"
            aria-live="polite"
            aria-modal="false"
            aria-labelledby={headingId}
            initial={reduceMotion ? false : { y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduceMotion ? undefined : { y: 100, opacity: 0 }}
            transition={{ duration: motionDurations.sheet, ease: easeOutSoft }}
            className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 backdrop-blur shadow-lg"
          >
            <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p
                id={headingId}
                className="text-sm leading-relaxed text-zinc-700"
              >
                {t(locale, 'consent.banner_text')}{' '}
                <Link
                  href="/politica-cookies"
                  className="font-medium text-zinc-900 underline underline-offset-2 hover:text-purple-700"
                >
                  {t(locale, 'consent.privacy_link')}
                </Link>
                .
              </p>
              <div className="flex shrink-0 flex-wrap gap-2 sm:flex-nowrap">
                <button
                  type="button"
                  onClick={() => setShowCustomize(true)}
                  disabled={pending}
                  className="h-10 rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60"
                >
                  {t(locale, 'consent.customize')}
                </button>
                {/* Refuză tot + Accept tot — visual parity per Legea 506/2004
                    & EDPB 05/2020: both buttons use the same filled style and
                    size so neither is nudged over the other. */}
                <button
                  type="button"
                  onClick={() => save('essential')}
                  disabled={pending}
                  className="h-10 rounded-full bg-zinc-900 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:scale-[1.02] hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-60 motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                >
                  {t(locale, 'consent.essential_only')}
                </button>
                <button
                  type="button"
                  onClick={() => save('all')}
                  disabled={pending}
                  autoFocus
                  className="h-10 rounded-full bg-zinc-900 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:scale-[1.02] hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-60 motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                >
                  {t(locale, 'consent.accept_all')}
                </button>
              </div>
            </div>
          </motion.div>

          {showCustomize && (
            <CustomizeModal
              locale={locale}
              analytics={analytics}
              marketing={marketing}
              onAnalytics={setAnalytics}
              onMarketing={setMarketing}
              onClose={() => setShowCustomize(false)}
              onSave={() => save('custom')}
              pending={pending}
              reduceMotion={reduceMotion}
            />
          )}
        </>
      )}
    </AnimatePresence>
  );
}

function CustomizeModal({
  locale,
  analytics,
  marketing,
  onAnalytics,
  onMarketing,
  onClose,
  onSave,
  pending,
  reduceMotion,
}: {
  locale: Locale;
  analytics: boolean;
  marketing: boolean;
  onAnalytics: (v: boolean) => void;
  onMarketing: (v: boolean) => void;
  onClose: () => void;
  onSave: () => void;
  pending: boolean;
  reduceMotion: boolean;
}) {
  const titleId = 'hir-consent-modal-title';

  // Close on Escape — keyboard accessibility.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: motionDurations.sheet, ease: easeOutSoft }}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-900/60 px-4 py-4 backdrop-blur-sm sm:items-center"
    >
      <motion.div
        initial={reduceMotion ? false : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={reduceMotion ? undefined : { y: 40, opacity: 0 }}
        transition={{ duration: motionDurations.sheet, ease: easeOutSoft }}
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
      >
        <h2
          id={titleId}
          className="text-lg font-semibold text-zinc-900"
        >
          {t(locale, 'consent.modal_title')}
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          {t(locale, 'consent.modal_intro')}
        </p>

        <div className="mt-4 space-y-3">
          <CategoryRow
            title={t(locale, 'consent.essential_label')}
            description={t(locale, 'consent.essential_desc')}
            checked={true}
            disabled
            onChange={() => undefined}
            badge={t(locale, 'consent.always_on')}
          />
          <CategoryRow
            title={t(locale, 'consent.analytics_label')}
            description={t(locale, 'consent.analytics_desc')}
            checked={analytics}
            disabled={false}
            onChange={onAnalytics}
          />
          <CategoryRow
            title={t(locale, 'consent.marketing_label')}
            description={t(locale, 'consent.marketing_desc')}
            checked={marketing}
            disabled={false}
            onChange={onMarketing}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Link
            href="/politica-cookies"
            className="mr-auto text-sm text-zinc-600 underline underline-offset-2 hover:text-zinc-900"
          >
            {t(locale, 'consent.privacy_link')}
          </Link>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-10 rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60"
          >
            {t(locale, 'consent.cancel')}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            autoFocus
            className="h-10 rounded-full bg-zinc-900 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:scale-[1.02] hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-60 motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
          >
            {t(locale, 'consent.save_preferences')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CategoryRow({
  title,
  description,
  checked,
  disabled,
  onChange,
  badge,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  badge?: string;
}) {
  return (
    <label
      className={[
        'flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3',
        disabled ? 'cursor-not-allowed opacity-90' : 'cursor-pointer hover:bg-zinc-50',
      ].join(' ')}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-700 disabled:opacity-60"
      />
      <span className="flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-900">{title}</span>
          {badge && (
            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-700">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-zinc-600">
          {description}
        </span>
      </span>
    </label>
  );
}
