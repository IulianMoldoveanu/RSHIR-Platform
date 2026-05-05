'use client';

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { registerPushServiceWorker } from '@/lib/push/register-sw';
import { subscribeToPush } from '@/lib/push/subscribe';

// v1 key — permanent dismiss (no TTL). If we ever need to re-prompt
// after a major UX change, bump to push-prompt-dismissed-v2.
const DISMISS_KEY = 'push-prompt-dismissed-v1';

/**
 * Post-login splash prompt for Web Push notifications — Wolt-style.
 *
 * Renders as a bottom-sheet overlay on top of the dashboard so the copy
 * is the first thing the courier sees after signing in (not buried inside
 * settings). One-time dismiss persists in localStorage under DISMISS_KEY.
 *
 * State machine:
 *   1. Browser doesn't support Notifications/PushManager → render nothing.
 *   2. Permission already 'granted' → silently re-subscribe (no UI).
 *   3. Permission 'denied' → render nothing (OS settings required; no nag).
 *   4. DISMISS_KEY in localStorage → render nothing (user already saw this).
 *   5. Otherwise → show splash overlay with explanation + CTA.
 */
export function PushBootstrap() {
  const [phase, setPhase] = useState<'idle' | 'splash' | 'asking' | 'done'>('idle');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return;
    }

    const permission = Notification.permission;

    if (permission === 'granted') {
      void enableSilently();
      return;
    }

    if (permission === 'denied') {
      return;
    }

    if (window.localStorage.getItem(DISMISS_KEY)) {
      return;
    }

    setPhase('splash');
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
      window.localStorage.setItem(DISMISS_KEY, '1');
    }
    setPhase('done');
  }

  if (phase !== 'splash' && phase !== 'asking') return null;

  return (
    /* Overlay backdrop */
    <div
      className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Activare notificări"
    >
      {/* Bottom sheet */}
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        {/* Close button */}
        <div className="mb-4 flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/15">
            <Bell className="h-5 w-5 text-violet-400" aria-hidden />
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Închide"
            className="text-zinc-500 hover:text-zinc-300"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <h2 className="text-base font-semibold text-zinc-100">
          Cere notificări ca să primești comenzi când ești online
        </h2>
        <p className="mt-1.5 text-sm text-zinc-400">
          Primești comenzi instant, fără să ții aplicația deschisă. Poți dezactiva oricând din setările telefonului.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleEnable}
            disabled={phase === 'asking'}
            className="w-full rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
          >
            {phase === 'asking' ? 'Se activează…' : 'Activează notificările'}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={phase === 'asking'}
            className="w-full rounded-xl border border-zinc-800 py-3 text-sm font-medium text-zinc-400 hover:text-zinc-200"
          >
            Mai târziu
          </button>
        </div>
      </div>
    </div>
  );
}
