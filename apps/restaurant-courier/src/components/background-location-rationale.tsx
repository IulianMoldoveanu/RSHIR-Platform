'use client';

import { useEffect, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { Button } from '@hir/ui';

const RATIONALE_SHOWN_KEY = 'hir_bg_loc_rationale_shown_v1';

/**
 * One-time rationale dialog explaining WHY we need background location
 * before triggering the Android 10+ "Allow all the time" permission prompt.
 *
 * Android 10+ requires a separate ACCESS_BACKGROUND_LOCATION grant, and
 * the OS only routes the user to the "Allow all the time" toggle if the
 * app first asks for foreground location AND then explicitly requests
 * background. Without context, riders silently pick "Only this time"
 * and the location stream dies when the app goes to the background mid-
 * shift. This dialog ALWAYS shows first on Android so the rider knows
 * what to pick.
 *
 * Trigger conditions:
 *   - Capacitor.isNativePlatform() === true
 *   - Capacitor.getPlatform() === 'android'
 *   - localStorage flag RATIONALE_SHOWN_KEY not set
 *
 * On non-Android (web, iOS), the component renders nothing.
 */
export function BackgroundLocationRationale() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        if (Capacitor.getPlatform() !== 'android') return;
      } catch {
        // @capacitor/core unavailable — web fallback, render nothing.
        return;
      }
      try {
        if (window.localStorage.getItem(RATIONALE_SHOWN_KEY)) return;
      } catch {
        // localStorage blocked — surface dialog anyway, dismissal becomes
        // session-scoped (acceptable for the first-shift flow).
      }
      if (!cancelled) setVisible(true);
    })();
    return () => { cancelled = true; };
  }, []);

  function handleAck() {
    try {
      window.localStorage.setItem(RATIONALE_SHOWN_KEY, '1');
    } catch {
      // ignore — dialog will re-show next session if storage is blocked.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Permisiune locație în fundal"
    >
      <div className="w-full max-w-md rounded-2xl border border-hir-border bg-hir-bg p-5 shadow-2xl ring-1 ring-inset ring-violet-500/15">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30 shadow-md shadow-violet-500/15">
            <MapPin className="h-5 w-5 text-violet-300" aria-hidden strokeWidth={2.25} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleAck}
            aria-label="Închide"
            className="h-7 w-7 rounded-full text-hir-muted-fg transition-colors hover:bg-hir-surface hover:text-hir-fg"
          >
            <X className="h-5 w-5" aria-hidden strokeWidth={2.25} />
          </Button>
        </div>

        <h2 className="text-base font-semibold tracking-tight text-hir-fg">
          De ce avem nevoie de locație „Permite tot timpul"
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-hir-muted-fg">
          În timpul turei trimitem poziția ta către dispecerat la fiecare 30 de
          secunde, ca să primești comenzile cele mai apropiate. Android oprește
          locația dacă aplicația merge în fundal — deci la următorul ecran cere
          alege <strong className="text-hir-fg">„Permite tot timpul"</strong>.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-hir-muted-fg">
          Locația este folosită doar cât ești online cu tură pornită. Când
          închizi tura, urmărirea se oprește complet.
        </p>

        <div className="mt-5">
          <Button
            type="button"
            onClick={handleAck}
            className="w-full rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white shadow-md shadow-violet-500/30 transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-lg hover:shadow-violet-500/40 active:translate-y-0"
          >
            Am înțeles — continuă
          </Button>
        </div>
      </div>
    </div>
  );
}
