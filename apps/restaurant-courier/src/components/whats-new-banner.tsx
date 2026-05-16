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
      <div className="mx-auto flex max-w-md flex-col gap-2 rounded-2xl border border-violet-500/40 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/20"
          >
            <Sparkles className="h-4 w-4 text-violet-300" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-hir-fg">
              {CURRENT_RELEASE.title}
            </p>
            <p className="mt-0.5 text-[11px] text-hir-muted-fg">
              {CURRENT_RELEASE.date}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Închide"
            className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-full text-hir-muted-fg hover:bg-hir-border hover:text-hir-fg"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <ul className="ml-1 list-disc space-y-1 pl-5 text-xs text-hir-muted-fg">
          {CURRENT_RELEASE.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>

        <button
          type="button"
          onClick={dismiss}
          className="self-end rounded-lg px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/10 hover:text-violet-200"
        >
          Am înțeles
        </button>
      </div>
    </div>
  );
}
