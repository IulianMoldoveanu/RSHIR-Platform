'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// Fleet route group error boundary. Catches any uncaught throw in a child
// page (orders / orders/[id] / orders/history / couriers / couriers/[id] /
// couriers/invite / earnings / settings) so the dispatcher sees a
// recoverable card instead of a blank screen mid-shift. Mirrors the
// dashboard/error.tsx shape — same copy tone, same reset button — so a
// fleet manager who has also signed in as a rider gets a familiar UX
// instead of two different error treatments.
export default function FleetError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[courier/fleet] runtime error', error);
  }, [error]);

  return (
    <div className="mx-auto mt-8 max-w-md rounded-2xl border border-rose-500/40 bg-rose-500/5 p-5 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10">
        <AlertTriangle className="h-5 w-5 text-rose-400" aria-hidden />
      </div>
      <h2 className="mt-3 text-base font-semibold text-zinc-100">
        Ceva nu a mers
      </h2>
      <p className="mt-1 text-xs text-zinc-400">
        Această pagină din dispecerat nu s-a putut încărca. Reîncearcă sau
        revino în câteva secunde.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[10px] text-zinc-600">
          ref: {error.digest}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 active:bg-violet-600"
      >
        <RefreshCw className="h-4 w-4" aria-hidden />
        Reîncarcă pagina
      </button>
    </div>
  );
}
