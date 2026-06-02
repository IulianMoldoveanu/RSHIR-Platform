'use client';

import { useEffect, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { Button } from '@hir/ui';

// NOTE: key bumped to v3 — copy escalated back to background ("Allow all the
// time") now that background geolocation ships (PR #860): foreground service +
// dispatch tracking while the shift is active. v2 was the foreground-only copy.
const RATIONALE_SHOWN_KEY = 'hir_loc_rationale_shown_v3';

/**
 * Prominent-disclosure dialog (Google Play location policy) shown BEFORE the
 * Android background-location permission prompt.
 *
 * Background geolocation ships in v1.0.0 (PR #860): while the shift is active
 * the app reports the courier's position so dispatch can offer nearby orders
 * and the client can follow the delivery — and it keeps reporting when the
 * phone is locked or the app is backgrounded, via a persistent foreground-
 * service notification. Android 10+ requires a two-step grant: "While using the
 * app" first, then a separate OS screen for "Allow all the time".
 *
 * This disclosure must appear before the OS prompt and explain, in plain
 * language, what is collected and why — see BACKGROUND-GEOLOCATION.md
 * ("Google Play — prominent disclosure").
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
      aria-label="Permisiune locație în timpul turei"
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
          De ce avem nevoie de locația ta în timpul turei
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-hir-muted-fg">
          Cât ești pe tură trimitem poziția ta către dispecerat, ca să primești
          comenzile apropiate și clientul să urmărească livrarea. Funcționează și
          când telefonul e blocat sau aplicația e în fundal. La ecranul de
          permisiuni alege <strong className="text-hir-fg">&bdquo;Permite tot timpul&rdquo;</strong>.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-hir-muted-fg">
          Cât urmărirea e activă vezi o notificare permanentă în bara de sus. Locația
          e folosită <strong className="text-hir-fg">doar cât ești pe tură</strong> —
          când închizi tura, urmărirea se oprește complet. Poți revoca oricând din
          setările telefonului.
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
