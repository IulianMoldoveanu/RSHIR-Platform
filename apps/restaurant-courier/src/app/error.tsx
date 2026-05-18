'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@hir/ui';

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-hir-bg px-4 py-16 text-hir-fg">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 ring-1 ring-rose-500/40 shadow-md shadow-rose-500/20">
          <AlertTriangle className="h-6 w-6 text-rose-300" aria-hidden strokeWidth={2.25} />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-hir-fg">
          S-a întâmplat o eroare
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-hir-muted-fg">
          Aplicația nu a putut încărca. Conexiune slabă sau eroare temporară de
          server. Reîncearcă în câteva secunde.
        </p>
        {error.digest ? (
          <p className="mt-3 inline-block rounded-md bg-hir-surface px-2.5 py-1 font-mono text-[10px] text-hir-muted-fg ring-1 ring-inset ring-hir-border">
            ref: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            onClick={() => reset()}
            className="h-11 gap-1.5 rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white shadow-md shadow-violet-500/30 transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-lg hover:shadow-violet-500/40 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden strokeWidth={2.25} />
            Reîncearcă
          </Button>
          <Link
            href="/dashboard/orders"
            className="inline-flex h-11 items-center rounded-xl border border-hir-border bg-hir-surface px-4 text-sm font-semibold text-hir-fg transition-all hover:-translate-y-px hover:border-violet-500/40 hover:bg-hir-border/60 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            Înapoi la comenzi
          </Link>
        </div>
      </div>
    </main>
  );
}
