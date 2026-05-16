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
      className="flex items-start gap-3 rounded-2xl border border-amber-600/30 bg-amber-950/40 px-4 py-3"
    >
      <Coffee className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
      <p className="flex-1 text-sm text-amber-200">
        Tură lungă. Ia o pauză dacă ai ocazia — conduci mai bine odihnit.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Închide avertisment"
        className="shrink-0 text-[11px] text-amber-400 hover:text-amber-200"
      >
        OK
      </button>
    </div>
  );
}
