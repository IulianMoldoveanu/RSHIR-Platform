'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, toast } from '@hir/ui';

const KEYS_TO_CLEAR = [
  'hir-courier-onboarded',
  'hir-courier-first-shift-done',
];

/**
 * Settings action that clears the LocalStorage flags gating the welcome
 * carousel + first-shift tutorial, then triggers a full reload so both
 * overlays re-render from the dashboard layout.
 *
 * Useful when:
 *   - the courier dismissed onboarding too fast and wants a refresher
 *   - a different person picks up the phone (e.g. shared device on a fleet)
 *
 * Pure client. No server side effects.
 */
export function ReplayOnboardingButton() {
  const [busy, setBusy] = useState(false);

  function onReplay() {
    setBusy(true);
    try {
      if (typeof localStorage !== 'undefined') {
        for (const k of KEYS_TO_CLEAR) {
          try {
            localStorage.removeItem(k);
          } catch {
            // private mode or quota — ignore
          }
        }
      }
      toast.success('Pornesc tutorialul.', { duration: 2_500 });
      // Small delay so the toast is visible before the reload.
      window.setTimeout(() => {
        window.location.assign('/dashboard');
      }, 600);
    } catch {
      toast('Nu am putut reseta tutorialul. Reîncearcă.', { duration: 5_000 });
      setBusy(false);
    }
  }

  return (
    <Button
      onClick={onReplay}
      variant="outline"
      size="sm"
      disabled={busy}
      className="min-h-[40px] gap-1.5 self-start rounded-lg border-hir-border bg-hir-surface px-3 py-2 text-xs font-semibold text-hir-fg transition-all hover:-translate-y-px hover:border-violet-500/40 hover:bg-hir-border/60 hover:shadow-md hover:shadow-violet-500/10 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2 disabled:opacity-60 disabled:hover:translate-y-0"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden strokeWidth={2.25} />
      {busy ? 'Se pregătește…' : 'Reia tutorialul'}
    </Button>
  );
}
