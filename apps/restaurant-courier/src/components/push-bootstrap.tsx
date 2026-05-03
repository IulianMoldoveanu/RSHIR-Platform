'use client';

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { registerPushServiceWorker } from '@/lib/push/register-sw';
import { subscribeToPush } from '@/lib/push/subscribe';

const DISMISS_KEY = 'hir.courier.pushPromptDismissedAt';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Mounts on the dashboard layout. Walks the courier through enabling
 * Web Push notifications:
 *
 *   1. If browser doesn't support Notifications/PushManager → render nothing.
 *   2. If permission is already 'granted' → silently register SW + subscription
 *      (idempotent, no UI).
 *   3. If permission is 'default' (never asked) → show a small banner
 *      explaining why notifications matter and an "Activează" CTA.
 *      Dismiss persists for 7 days in localStorage.
 *   4. If permission is 'denied' → render nothing (browser won't re-prompt;
 *      courier must enable in OS settings; we don't nag).
 *
 * The banner copy is intentionally short and value-first:
 * "primești comenzi instant, fără să ții aplicația deschisă".
 */
export function PushBootstrap() {
  const [phase, setPhase] = useState<'idle' | 'banner' | 'asking' | 'done'>('idle');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return;
    }

    const dismissedAtRaw = window.localStorage.getItem(DISMISS_KEY);
    const dismissedAt = dismissedAtRaw ? Number(dismissedAtRaw) : 0;
    const stillDismissed = dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS;

    const permission = Notification.permission;

    if (permission === 'granted') {
      // Silent re-subscribe path.
      void enableSilently();
      return;
    }

    if (permission === 'denied') {
      // Browser said no; do nothing.
      return;
    }

    if (stillDismissed) {
      // User dismissed our banner recently; respect it.
      return;
    }

    setPhase('banner');
  }, []);

  async function enableSilently() {
    const reg = await registerPushServiceWorker();
    if (!reg) return;
    const supabase = getBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await subscribeToPush(reg, token);
  }

  async function handleEnable() {
    setPhase('asking');
    try {
      const reg = await registerPushServiceWorker();
      if (!reg) {
        // Permission denied or unsupported; close the banner.
        setPhase('done');
        return;
      }
      const supabase = getBrowserSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) await subscribeToPush(reg, token);
    } finally {
      setPhase('done');
    }
  }

  function handleDismiss() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setPhase('done');
  }

  if (phase !== 'banner' && phase !== 'asking') return null;

  return (
    <div
      className="mx-3 mt-3 flex items-start gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3"
      role="region"
      aria-label="Activare notificări"
    >
      <Bell className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-100">Activează notificările</p>
        <p className="mt-0.5 text-xs text-zinc-400">
          Primești comenzi instant, fără să ții aplicația deschisă.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleEnable}
            disabled={phase === 'asking'}
            className="rounded-md bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
          >
            {phase === 'asking' ? 'Se activează…' : 'Activează'}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={phase === 'asking'}
            className="rounded-md px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
          >
            Mai târziu
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Închide"
        className="text-zinc-500 hover:text-zinc-300"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
