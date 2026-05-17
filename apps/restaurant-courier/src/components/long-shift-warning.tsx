'use client';

import { useEffect, useState } from 'react';
import { Coffee } from 'lucide-react';

const LONG_SHIFT_MS = 6 * 60 * 60 * 1000; // 6 hours
const CHECK_INTERVAL_MS = 60_000; // re-check every minute

/**
 * Shows a gentle banner when the courier has been on shift for 6+ hours
 * without ending it. Purely informational — no forced action.
 * Dismissed per session; the banner re-appears on the next shift page visit
 * if the courier is still on shift and past 6h.
 */
export function LongShiftWarning({ startedAt }: { startedAt: string }) {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function check() {
      const elapsed = Date.now() - new Date(startedAt).getTime();
      setShow(elapsed >= LONG_SHIFT_MS);
    }
    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!show || dismissed) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 shadow-md shadow-amber-500/10"
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/40"
      >
        <Coffee className="h-4 w-4 text-amber-200" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300/90">
          Tură lungă
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-amber-100">
          Ia o pauză dacă ai ocazia — conduci mai bine odihnit.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Închide avertisment"
        className="shrink-0 self-start rounded-md px-2 py-1 text-[11px] font-semibold text-amber-300 transition-colors hover:bg-amber-500/10 hover:text-amber-100 focus-visible:outline-2 focus-visible:outline-amber-500 focus-visible:outline-offset-2"
      >
        OK
      </button>
    </div>
  );
}
