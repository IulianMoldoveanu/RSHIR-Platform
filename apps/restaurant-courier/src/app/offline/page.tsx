/**
 * Offline fallback for the courier PWA.
 *
 * Served from cache when the rider loses connectivity mid-ride. The
 * service worker (sw-push.js) caches active-order pages; this page is
 * the catch-all when even those are not available.
 */

export const metadata = {
  title: 'Offline — HIR Curier',
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-zinc-100">
      <div className="max-w-sm space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800">
          <span aria-hidden className="text-3xl">
            &#9888;
          </span>
        </div>
        <h1 className="text-2xl font-semibold">Fără conexiune</h1>
        <p className="text-sm text-zinc-400">
          Aplicația HIR Curier nu poate ajunge la server în acest moment. Verificați semnalul mobil sau Wi-Fi-ul și încercați din nou.
        </p>
        <p className="text-xs text-zinc-500">
          Comanda activă rămâne salvată local — reveniți la aceeași pagină când conexiunea revine.
        </p>
      </div>
    </main>
  );
}
