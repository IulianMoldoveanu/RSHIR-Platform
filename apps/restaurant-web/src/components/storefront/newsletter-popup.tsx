'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// Track A #11: storefront newsletter popup. Triggers on whichever happens
// first: 30s on page, or 50% scroll. Single dismissal stored in cookie
// `hir_newsletter_dismissed_v1` for 30 days. Mobile = bottom sheet,
// desktop = centered card.

const COOKIE = 'hir_newsletter_dismissed_v1';
const TIMER_MS = 30_000;
const SCROLL_PCT = 0.5;
const COOKIE_DAYS = 30;

function hasDismissCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${COOKIE}=`));
}

function setDismissCookie(): void {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + COOKIE_DAYS * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${COOKIE}=1; path=/; expires=${expires}; samesite=lax`;
}

type Status = 'idle' | 'sending' | 'success' | 'already' | 'error';

export function NewsletterPopup({ brandColor }: { brandColor: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (hasDismissCookie()) return;

    let triggered = false;
    const trigger = () => {
      if (triggered) return;
      triggered = true;
      setOpen(true);
    };

    const timer = window.setTimeout(trigger, TIMER_MS);
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      if (window.scrollY / max >= SCROLL_PCT) trigger();
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  function dismiss() {
    setDismissCookie();
    setOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'sending') return;
    if (!consent) {
      setErrorMsg('Trebuie să accepți termenii pentru a te abona.');
      setStatus('error');
      return;
    }
    setStatus('sending');
    setErrorMsg('');
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), consent: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string; error?: string };
      if (!res.ok || !data.ok) {
        setErrorMsg(
          res.status === 429
            ? 'Prea multe încercări. Reîncearcă în câteva minute.'
            : 'Ceva nu a mers. Reîncearcă.',
        );
        setStatus('error');
        return;
      }
      if (data.status === 'already_subscribed') {
        setStatus('already');
      } else {
        setStatus('success');
      }
      setDismissCookie();
    } catch {
      setErrorMsg('Ceva nu a mers. Reîncearcă.');
      setStatus('error');
    }
  }

  if (!open) return null;

  const success = status === 'success' || status === 'already';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="newsletter-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Închide"
          className="absolute right-3 top-3 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>

        {success ? (
          <div className="py-4 text-center">
            <h2 id="newsletter-title" className="text-lg font-semibold text-zinc-900">
              {status === 'already' ? 'Ești deja abonat' : 'Verifică-ți emailul'}
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              {status === 'already'
                ? 'Adresa este deja înregistrată. Mulțumim!'
                : 'Ți-am trimis un link de confirmare. După confirmare primești codul de 10%.'}
            </p>
            <button
              type="button"
              onClick={dismiss}
              className="mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: brandColor }}
            >
              Am înțeles
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h2 id="newsletter-title" className="pr-8 text-lg font-semibold text-zinc-900">
              Comandă mai ieftin: -10% la prima comandă
            </h2>
            <p className="mt-1 text-sm text-zinc-600">Trimitem o singură ofertă pe lună.</p>

            <label className="mt-4 block text-sm">
              <span className="sr-only">Email</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="adresa@email.com"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-zinc-900"
              />
            </label>

            <label className="mt-3 flex items-start gap-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
                className="mt-0.5 h-4 w-4"
              />
              <span>
                Sunt de acord să primesc emailuri promoționale și am citit{' '}
                <a href="/privacy" className="underline" target="_blank" rel="noopener noreferrer">
                  politica de confidențialitate
                </a>
                .
              </span>
            </label>

            {status === 'error' && errorMsg && (
              <p className="mt-2 text-xs text-rose-600" role="alert">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: brandColor }}
            >
              {status === 'sending' ? 'Se trimite…' : 'Vreau codul de 10%'}
            </button>

            <button
              type="button"
              onClick={dismiss}
              className="mt-2 w-full rounded-lg px-4 py-2 text-xs text-zinc-500 hover:text-zinc-700"
            >
              Nu, mulțumesc
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
