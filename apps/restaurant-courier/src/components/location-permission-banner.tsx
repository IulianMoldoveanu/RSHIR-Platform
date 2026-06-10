'use client';

import { useEffect, useState } from 'react';
import { MapPinOff, X } from 'lucide-react';
import { requestLocationPermission } from '@/lib/native/geolocation';

/**
 * Recovery banner for a mid-shift location-permission loss.
 *
 * The dispatch reporter (LocationTracker) requests background location ("Allow
 * all the time"). If the courier revokes it, only granted "while using", or
 * Android auto-revokes after inactivity, the reporter stops feeding
 * courier_shifts.last_lat/lng — the courier appears online but is invisible to
 * dispatch and stops receiving nearby offers, with no feedback (the error was
 * previously swallowed to console). The map can still look fine because it runs
 * its OWN foreground watch with different permission semantics.
 *
 * This banner listens for the `hir:location-denied` event the tracker now
 * dispatches and shows a persistent, actionable recovery prompt. Tapping
 * "Activează" re-requests the permission; if the OS hard-denied it, the copy
 * directs the courier to Settings. Self-clears on the next successful fix.
 */
export function LocationPermissionBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onDenied() {
      setVisible(true);
    }
    window.addEventListener('hir:location-denied', onDenied);
    return () => window.removeEventListener('hir:location-denied', onDenied);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="sticky top-14 z-[1090] mx-3 mt-2 flex items-start gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-3 text-sm shadow-lg shadow-rose-500/10 ring-1 ring-inset ring-rose-500/20 backdrop-blur"
    >
      <span
        aria-hidden
        className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-rose-500/15 ring-1 ring-rose-500/30"
      >
        <MapPinOff className="h-4 w-4 text-rose-300" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-rose-100">Locația e oprită — nu primești comenzi</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-rose-200/90">
          Cât locația e oprită ești invizibil pentru dispecerat. Activează
          <strong className="text-rose-100"> „Permite tot timpul”</strong> ca să primești comenzi din zonă.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              // Optimistically hide; if it's still denied the tracker re-fires
              // `hir:location-denied` on the next watch error and we reappear.
              void requestLocationPermission();
              setVisible(false);
            }}
            className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-rose-500/30 transition hover:-translate-y-px hover:bg-rose-400 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-rose-400 focus-visible:outline-offset-2"
          >
            Activează locația
          </button>
          <span className="text-[11px] text-rose-200/70">sau Setări → Aplicații → HIR Curier → Locație</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Închide"
        className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-rose-200/70 transition-colors hover:bg-rose-500/15 hover:text-rose-100"
      >
        <X className="h-4 w-4" strokeWidth={2.25} />
      </button>
    </div>
  );
}
