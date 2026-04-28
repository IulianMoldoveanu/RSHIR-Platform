'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard/error.tsx]', error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-xl border border-rose-200 bg-white p-6 shadow-sm">
        <h1 className="text-base font-semibold text-zinc-900">
          A apărut o eroare la încărcare
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Ceva nu a mers cum trebuie. Detalii tehnice:
        </p>
        <pre className="mt-3 max-h-48 overflow-x-auto rounded-md bg-zinc-50 p-3 text-left text-xs text-zinc-700">
          {error.message || 'unknown error'}
          {error.digest ? `\n\ndigest: ${error.digest}` : ''}
        </pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Reîncearcă
          </button>
          <a
            href="/dashboard?skipOnboarding=1"
            className="inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Sări peste onboarding
          </a>
          <a
            href="/login"
            className="inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Reconectare
          </a>
        </div>
      </div>
    </main>
  );
}
