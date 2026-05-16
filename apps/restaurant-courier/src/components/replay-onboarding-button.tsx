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
      className="self-start"
    >
      <RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden />
      {busy ? 'Se pregătește…' : 'Reia tutorialul'}
    </Button>
  );
}
