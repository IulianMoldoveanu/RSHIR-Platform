'use client';

import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  CURRENT_RELEASE,
  hasSeenCurrentRelease,
  markCurrentReleaseSeen,
} from '@/lib/whats-new';

/**
 * Bottom banner that fires ONCE per courier when a new release ships and
 * their stored last-seen id doesn't match CURRENT_RELEASE.id. Dismissing
 * the banner marks the release as seen so it stops showing.
 *
 * Sits above the bottom-nav (z-[1090] — below the offline banner at
 * z-[1100] so an actually-broken state takes precedence).
 *
 * Renders null when the courier has already seen the current release
 * OR when the welcome carousel is being shown for a brand-new account
 * (we treat onboarded=false as "hasn't even seen the basics yet").
 */
export function WhatsNewBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Skip when the first-run onboarding hasn't completed — too noisy
    // to stack a "what's new" on top of "welcome to HIR Curier".
    try {
      if (!localStorage.getItem('hir-courier-onboarded')) return;
    } catch {
      // ignore
    }
    if (hasSeenCurrentRelease()) return;
    setVisible(true);
  }, []);

  function dismiss() {
    markCurrentReleaseSeen();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-20 z-[1090] px-3"
    >
      <div className="mx-auto flex max-w-md flex-col gap-2 rounded-2xl border border-violet-500/40 bg-hir-bg/95 p-4 shadow-2xl shadow-violet-500/20 ring-1 ring-inset ring-violet-500/15 backdrop-blur">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/20 ring-1 ring-violet-500/40 shadow-sm shadow-violet-500/20"
          >
            <Sparkles
              className="h-4 w-4 text-violet-300 drop-shadow-[0_0_4px_rgba(167,139,250,0.6)]"
              strokeWidth={2.25}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-tight text-hir-fg">
              {CURRENT_RELEASE.title}
            </p>
            <p className="mt-0.5 text-[11px] tabular-nums text-hir-muted-fg">
              {CURRENT_RELEASE.date}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Închide"
            className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-full text-hir-muted-fg transition-colors hover:bg-hir-surface hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            <X className="h-4 w-4" aria-hidden strokeWidth={2.25} />
          </button>
        </div>

        <ul className="ml-1 list-disc space-y-1 pl-5 text-xs leading-relaxed text-hir-muted-fg">
          {CURRENT_RELEASE.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>

        <button
          type="button"
          onClick={dismiss}
          className="self-end rounded-lg px-3 py-1.5 text-xs font-semibold text-violet-300 transition-colors hover:bg-violet-500/10 hover:text-violet-200 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
        >
          Am înțeles
        </button>
      </div>
    </div>
  );
}
