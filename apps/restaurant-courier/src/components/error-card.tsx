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
    <div className="mx-auto mt-8 max-w-md rounded-2xl border border-rose-500/40 bg-rose-500/5 p-5 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10">
        <AlertTriangle className="h-5 w-5 text-rose-400" aria-hidden />
      </div>
      <h2 className="mt-3 text-base font-semibold text-zinc-100">{title}</h2>
      <p className="mt-1 text-xs text-zinc-400">{hint}</p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[10px] text-zinc-600">ref: {error.digest}</p>
      ) : null}
      <Button
        type="button"
        onClick={() => reset()}
        className="mt-4 gap-1.5 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400"
      >
        <RefreshCw className="h-4 w-4" aria-hidden />
        Reîncearcă
      </Button>
    </div>
  );
}
