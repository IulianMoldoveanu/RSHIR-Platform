'use client';

import { useEffect } from 'react';

// SECURITY: do not render error.message — Next surfaces server-side
// error strings that can leak SQL fragments / internal hostnames /
// JWT claims to anyone who can trip the boundary. Same redaction as
// /dashboard/error.tsx and global-error.tsx (PR #21).

export default function PartnerPortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[partner-portal/error.tsx]', error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-xl border border-rose-200 bg-white p-6 shadow-sm">
        <h1 className="text-base font-semibold text-zinc-900">
          A apărut o eroare la încărcarea portalului
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Datele nu s-au putut încărca. Reîncearcă în câteva secunde — dacă
          persistă, trimite codul de mai jos echipei HIR.
        </p>
        {error.digest ? (
          <pre className="mt-3 overflow-x-auto rounded-md bg-zinc-50 p-3 text-left text-xs text-zinc-500">
            ref: {error.digest}
          </pre>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
          >
            Reîncearcă
          </button>
          <a
            href="/partner-portal"
            className="inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
          >
            Înapoi la tabloul de bord
          </a>
          <a
            href="/login"
            className="inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
          >
            Reconectare
          </a>
        </div>
      </div>
    </main>
  );
}
