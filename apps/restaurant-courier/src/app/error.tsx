'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// Top-level error boundary for the courier app (catches login / register /
// offline / admin route throws). Dashboard sub-tree has its own
// error.tsx with route-aware copy. Friendly RO + dark theme.
//
// SECURITY: digest-only, never error.message — same redaction as the
// admin global-error and dashboard/error boundaries.
export default function CourierError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[restaurant-courier/error.tsx]', error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-16 text-zinc-100">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 ring-1 ring-rose-500/30">
          <AlertTriangle className="h-6 w-6 text-rose-400" aria-hidden />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-zinc-100">
          S-a întâmplat o eroare
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Aplicația nu a putut încărca. Conexiune slabă sau eroare temporară de
          server. Reîncearcă în câteva secunde.
        </p>
        {error.digest ? (
          <p className="mt-3 inline-block rounded-md bg-zinc-900 px-2.5 py-1 font-mono text-[10px] text-zinc-500 ring-1 ring-inset ring-zinc-800">
            ref: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white hover:bg-violet-400 active:bg-violet-600"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Reîncearcă
          </button>
          <Link
            href="/dashboard/orders"
            className="inline-flex h-11 items-center rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Înapoi la comenzi
          </Link>
        </div>
      </div>
    </main>
  );
}
