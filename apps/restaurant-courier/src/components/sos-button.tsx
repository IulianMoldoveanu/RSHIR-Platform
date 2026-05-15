'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Phone, X } from 'lucide-react';

const LONG_PRESS_MS = 1200;
const EMERGENCY_NUMBER = '112';

// Floating SOS button shown only on active-delivery screens. Two-step
// dialer to avoid accidental 112 calls: tap opens a modal, then a
// long-press on the dial button triggers tel:112. The long-press
// gate is the standard UX pattern in Stuart/Glovo couriers; in
// Romania, RO 112 dispatcher penalises false calls.
export function SosButton() {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggeredRef = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Move focus into the modal when it opens (focus trap entry point).
  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
    }
  }, [open]);

  // Close on Escape — standard modal keyboard contract (WCAG 2.1.1).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function startPress() {
    // Hybrid devices fire touchstart + an emulated mousedown for the
    // same gesture; without this guard, the second call would orphan
    // the first interval and could keep ticking past endPress and dial
    // 112 after the rider already released.
    if (timerRef.current) clearInterval(timerRef.current);
    triggeredRef.current = false;
    setProgress(0);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - startedAt) / LONG_PRESS_MS) * 100);
      setProgress(pct);
      if (pct >= 100 && !triggeredRef.current) {
        triggeredRef.current = true;
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        window.location.href = `tel:${EMERGENCY_NUMBER}`;
      }
    }, 40);
  }

  function endPress() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (!triggeredRef.current) setProgress(0);
  }

  return (
    <>
      <button
        type="button"
        aria-label="SOS — Urgență"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-3 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-rose-700/60 bg-rose-600 text-white shadow-lg shadow-rose-900/40 active:scale-95"
      >
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sos-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
        >
          <div className="w-full max-w-sm rounded-2xl border border-rose-700/40 bg-zinc-950 p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-400" aria-hidden />
                <h2 id="sos-title" className="text-base font-semibold text-zinc-100">
                  Urgență
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Închide"
                className="rounded-md p-1 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <p className="mt-3 text-sm text-zinc-300">
              Pentru a suna serviciul de urgență 112, țineți apăsat butonul de mai jos timp de
              o secundă.
            </p>

            <button
              type="button"
              aria-label="Ține apăsat pentru a suna 112"
              onMouseDown={startPress}
              onMouseUp={endPress}
              onMouseLeave={endPress}
              onTouchStart={startPress}
              onTouchEnd={endPress}
              onTouchCancel={endPress}
              className="relative mt-4 flex h-14 w-full select-none items-center justify-center gap-2 overflow-hidden rounded-xl bg-rose-600 text-base font-semibold text-white active:bg-rose-700"
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-rose-800/70 transition-[width]"
                style={{ width: `${progress}%` }}
              />
              <span className="relative flex items-center gap-2">
                <Phone className="h-5 w-5" aria-hidden />
                Ține apăsat pentru 112
              </span>
            </button>

            <p className="mt-3 text-[11px] text-zinc-500">
              Apel direct la operatorul de urgență. Folosiți-l doar pentru situații reale
              (accident, agresiune, urgență medicală).
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
