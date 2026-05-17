'use client';

import { RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@hir/ui';

// PWA service-worker fallback rendered when the device is offline AND
// the requested route isn't cached. Reload button retries the network;
// active deliveries are already persisted client-side via TransitionSync.
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-hir-bg px-6 text-center text-hir-fg">
      <div className="w-full max-w-sm space-y-5">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-violet-500/10 text-violet-300 shadow-lg shadow-violet-500/20 ring-1 ring-violet-500/30">
          <WifiOff className="h-10 w-10" aria-hidden strokeWidth={2.25} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Ești offline</h1>
        <p className="text-sm leading-relaxed text-hir-muted-fg">
          Verifică conexiunea ca să continui livrările.
        </p>
        <p className="rounded-xl border border-hir-border bg-hir-surface px-4 py-3 text-xs leading-relaxed text-hir-muted-fg">
          Comanda activă rămâne salvată local — revii la aceeași pagină când
          conexiunea se reface. Tranzițiile pe care le-ai făcut offline
          (acceptare / ridicare / livrare) se sincronizează automat.
        </p>
        <Button
          type="button"
          onClick={() => window.location.reload()}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white shadow-md shadow-violet-500/30 transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-lg hover:shadow-violet-500/40 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Reîncearcă
        </Button>
      </div>
    </main>
  );
}
