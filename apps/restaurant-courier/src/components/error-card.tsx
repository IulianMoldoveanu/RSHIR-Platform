'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@hir/ui';

// Shared error card used by every error.tsx boundary in the app.
// Logs to console + Sentry-via-onload (configured elsewhere) and
// renders a recoverable card with a Reîncearcă button. The optional
// title lets each segment surface a more specific message
// (e.g. "Comanda nu s-a putut încărca") without changing the look.
export function ErrorCard({
  error,
  reset,
  title = 'Ceva nu a mers',
  hint = 'Pagina nu s-a putut încărca. Conexiune slabă sau o eroare temporară de server. Reîncearcă sau revino în câteva secunde.',
  scope,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  hint?: string;
  scope?: string;
}) {
  useEffect(() => {
    const tag = scope ? `[courier/${scope}]` : '[courier]';
    console.error(`${tag} runtime error`, error);
  }, [error, scope]);

  return (
    <div className="mx-auto mt-8 max-w-md rounded-2xl border border-rose-500/40 bg-rose-500/5 p-5 text-center shadow-md shadow-rose-500/10 ring-1 ring-inset ring-rose-500/15">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-rose-500/15 ring-1 ring-rose-500/40 shadow-md shadow-rose-500/20">
        <AlertTriangle className="h-5 w-5 text-rose-300" aria-hidden strokeWidth={2.25} />
      </div>
      <h2 className="mt-3 text-base font-semibold tracking-tight text-hir-fg">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-hir-muted-fg">{hint}</p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[10px] text-hir-muted-fg/70">ref: {error.digest}</p>
      ) : null}
      <Button
        type="button"
        onClick={() => reset()}
        className="mt-4 gap-1.5 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-violet-500/30 transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-lg hover:shadow-violet-500/40 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
      >
        <RefreshCw className="h-4 w-4" aria-hidden strokeWidth={2.25} />
        Reîncearcă
      </Button>
    </div>
  );
}
