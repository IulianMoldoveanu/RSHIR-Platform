'use client';

import { WifiOff } from 'lucide-react';
import { Button } from '@hir/ui';

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-hir-bg px-6 text-center text-hir-fg">
      <div className="max-w-sm space-y-5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-hir-surface">
          <WifiOff className="h-8 w-8 text-violet-400" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold">Ești offline</h1>
        <p className="text-sm text-hir-muted-fg">
          Verificați conexiunea pentru a continua livrările.
        </p>
        <p className="text-xs text-hir-muted-fg">
          Comanda activă rămâne salvată local — reveniți la aceeași pagină când conexiunea revine.
        </p>
        <Button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white hover:bg-violet-400"
        >
          Reîncearcă
        </Button>
      </div>
    </main>
  );
}
