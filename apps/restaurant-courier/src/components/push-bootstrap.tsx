'use client';

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { registerPushServiceWorker } from '@/lib/push/register-sw';
import { subscribeToPush } from '@/lib/push/subscribe';
import { isCategoryEnabled } from '@/lib/push/preferences';
import { Button } from '@hir/ui';

// v1 key — permanent dismiss (no TTL). If we ever need to re-prompt
// after a major UX change, bump to push-prompt-dismissed-v2.
const DISMISS_KEY = 'push-prompt-dismissed-v1';

// Snooze key for the post-delivery gentle re-ask. Stored as a Unix
// timestamp (ms) representing "don't show before this time".
const REREASK_SNOOZE_KEY = 'pushReAskAt';

// sessionStorage flag set by order-actions when the first DELIVERED
// transition succeeds in this session.
const SESSION_DELIVERED_FLAG = 'hir:first-delivered-this-session';

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
 *
 * Additionally mounts <PushReAskBanner> which watches for the first
 * DELIVERED transition in the session and shows a non-blocking bottom
 * banner as a gentle second-chance prompt.
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

    // If the courier has disabled new-order notifications, skip the prompt.
    if (!isCategoryEnabled('new_orders')) {
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

  if (phase !== 'splash' && phase !== 'asking') return <PushReAskBanner />;

  return (
    <>
      {/* Overlay backdrop */}
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              aria-label="Închide"
              className="h-7 w-7 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-5 w-5" aria-hidden />
            </Button>
          </div>

          <h2 className="text-base font-semibold text-zinc-100">
            Cere notificări ca să primești comenzi când ești online
          </h2>
          <p className="mt-1.5 text-sm text-zinc-400">
            Primești comenzi instant, fără să ții aplicația deschisă. Poți dezactiva oricând din setările telefonului.
          </p>

          <div className="mt-5 flex flex-col gap-2">
            <Button
              type="button"
              onClick={handleEnable}
              disabled={phase === 'asking'}
              className="w-full rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white hover:bg-violet-400"
            >
              {phase === 'asking' ? 'Se activează…' : 'Activează notificările'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDismiss}
              disabled={phase === 'asking'}
              className="w-full rounded-xl border-zinc-800 py-3 text-sm font-medium text-zinc-400 hover:text-zinc-200"
            >
              Mai târziu
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Non-blocking bottom banner shown once per session after the courier
 * completes their first DELIVERED transition, IF push permission is still
 * 'default' AND the 7-day snooze has not been set.
 *
 * The banner sits above the tab bar (z-50, bottom-20) so it is visible
 * but doesn't block the order flow. `requestPermission` is only called
 * inside a button onClick — never bypassing the user gesture requirement.
 */
function PushReAskBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;

    // Check 7-day snooze.
    try {
      const snoozeUntil = window.localStorage.getItem(REREASK_SNOOZE_KEY);
      if (snoozeUntil && Number(snoozeUntil) > Date.now()) return;
    } catch {
      // localStorage blocked — skip banner.
      return;
    }

    // Poll sessionStorage for the delivered flag (set by order-actions.tsx).
    // We poll rather than listen to a custom event so the banner still works
    // even when the tab navigates between pages within the same session.
    const timer = setInterval(() => {
      try {
        const flagged = sessionStorage.getItem(SESSION_DELIVERED_FLAG);
        if (flagged) {
          clearInterval(timer);
          setVisible(true);
        }
      } catch {
        clearInterval(timer);
      }
    }, 1500);

    return () => clearInterval(timer);
  }, []);

  async function handleEnable() {
    setVisible(false);
    // requestPermission MUST be called directly inside a user gesture handler.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    // Best-effort silent subscribe.
    try {
      const { registerPushServiceWorker } = await import('@/lib/push/register-sw');
      const { subscribeToPush } = await import('@/lib/push/subscribe');
      const { getBrowserSupabase } = await import('@/lib/supabase/browser');
      const reg = await registerPushServiceWorker();
      if (!reg) return;
      const supabase = getBrowserSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) await subscribeToPush(reg, token);
    } catch {
      // Non-critical — courier can enable from settings.
    }
  }

  function handleSnooze() {
    setVisible(false);
    try {
      window.localStorage.setItem(
        REREASK_SNOOZE_KEY,
        String(Date.now() + 7 * 24 * 3600 * 1000),
      );
    } catch {
      // localStorage blocked — ignore.
    }
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-0 right-0 z-50 px-4"
    >
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-violet-700/40 bg-zinc-950/95 px-4 py-3 shadow-xl backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <Bell className="h-4 w-4 shrink-0 text-violet-400" aria-hidden />
          <p className="text-xs text-zinc-200">
            Primești alertă pentru comenzi noi chiar și cu ecranul stins
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleEnable}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-violet-500 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-400"
          >
            Activează
          </button>
          <button
            type="button"
            onClick={handleSnooze}
            className="min-h-[44px] min-w-[44px] rounded-xl px-2 py-2 text-xs text-zinc-400 hover:text-zinc-200"
            aria-label="Amână notificarea"
          >
            <X className="h-4 w-4" aria-hidden />
            <span className="sr-only">Mai târziu</span>
          </button>
        </div>
      </div>
    </div>
  );
}
