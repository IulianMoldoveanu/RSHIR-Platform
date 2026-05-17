'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

// Persistent header banner shown when the device reports it has lost
// connectivity. Today the courier sees a stale page + silently failing
// swipes when they enter a basement / elevator / dead zone, with no
// signal that the device — not the app — is the problem.
//
// This is the visual half of the offline story. A future PR will add
// a Background Sync IndexedDB queue that captures swipe mutations
// while offline and replays them on reconnect; until then, this
// banner at least keeps the rider from blaming the app for what is
// really a network issue.
//
// Renders ONLY when navigator.onLine === false. SSR returns null
// (the layout still hydrates clean). Uses 'online' / 'offline' window
// events for fast change detection; on mount we read navigator.onLine
// directly so an already-offline boot shows the banner immediately.
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setOffline(!navigator.onLine);
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      // z-[1200] = above the sticky header (1100) but below modals (1300+),
      // so it remains visible while the rider scrolls or interacts with
      // navigation controls without obscuring sheets/dialogs that need
      // the foreground.
      className="sticky top-14 z-[1200] flex items-center justify-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-2 text-[11px] font-semibold text-amber-100 shadow-sm shadow-amber-500/20 backdrop-blur"
    >
      <span
        aria-hidden
        className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-500/40"
      >
        <WifiOff className="h-3.5 w-3.5 text-amber-200" strokeWidth={2.25} />
      </span>
      <span>
        Conexiune pierdută — comenzile vor fi sincronizate când reapare semnalul.
      </span>
    </div>
  );
}
