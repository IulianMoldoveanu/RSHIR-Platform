'use client';

// P0 audit #15 — gesture-bound Notification permission prompt.
//
// Chrome 95+/Firefox/Safari refuse Notification.requestPermission() calls
// that are not tied to a user gesture; the previous implementation auto-
// fired the prompt at <OrdersRealtime> mount which silently no-op'd in
// modern browsers, leaving admins under the impression "alerts don't work".
//
// We render three states in the top-bar:
//   - default       → button "Activează alerte" (calls requestPermission)
//   - granted       → badge "🔔 Alerte active"
//   - denied        → badge "🔕 Alerte blocate"
//
// `useSyncExternalStore` would be cleaner but rebuilding subscriptions for
// Notification permission changes across browsers is fiddly; a 1s poll is
// simpler and the rate is irrelevant (it only changes on user action).
import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

function readPermission(): PermissionState {
  if (typeof window === 'undefined') return 'unsupported';
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as PermissionState;
}

export function NotificationPermissionButton() {
  const [perm, setPerm] = useState<PermissionState>('unsupported');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setPerm(readPermission());
    // Re-sync on tab focus so a permission change made via the omnibox
    // padlock (Chrome) reflects in the UI without a hard refresh.
    const onFocus = () => setPerm(readPermission());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  async function requestPermission() {
    if (working) return;
    if (typeof Notification === 'undefined') return;
    setWorking(true);
    try {
      const result = await Notification.requestPermission();
      setPerm(result as PermissionState);
    } finally {
      setWorking(false);
    }
  }

  if (perm === 'unsupported') return null;
  if (perm === 'granted') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700">
        <BellRing className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Alerte active</span>
      </span>
    );
  }
  if (perm === 'denied') {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-500"
        title="Activează din setările browserului (lacăt → Notificări)."
      >
        <BellOff className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Alerte blocate</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void requestPermission()}
      disabled={working}
      className="inline-flex items-center gap-1.5 rounded-md border border-purple-300 bg-purple-50 px-2.5 py-1.5 text-xs font-medium text-purple-800 transition-colors hover:bg-purple-100 disabled:opacity-60"
    >
      <Bell className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">{working ? 'Se solicită…' : 'Activează alerte'}</span>
      <span className="sm:hidden">{working ? '…' : 'Alerte'}</span>
    </button>
  );
}
