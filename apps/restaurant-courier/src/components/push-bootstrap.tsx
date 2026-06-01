'use client';

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
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

    // ── Native (Capacitor) path: <CapacitorBootstrap> owns native push
    // registration end-to-end (it calls registerForPush() on mount). If we
    // ALSO registered here we'd race two PushNotifications.requestPermissions()
    // calls on the same launch. So on native this component is a no-op for
    // registration; it only renders the web re-ask banner (which itself
    // short-circuits on native). Web VAPID flow is untouched below.
    if (Capacitor.isNativePlatform()) {
      return;
    }

    // ── Web/PWA path (existing behaviour) ─────────────────────────────
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
    // Web-only: the splash never shows on native (CapacitorBootstrap owns
    // native registration), so this always drives the VAPID web-push flow.
    setPhase('asking');
    try {
      const supabase = getBrowserSupabase();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        setPhase('done');
        return;
      }

      const reg = await registerPushServiceWorker();
      if (!reg) return;
      await subscribeToPush(reg, accessToken);
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
        <div className="w-full max-w-md rounded-2xl border border-hir-border bg-hir-bg p-5 shadow-2xl ring-1 ring-inset ring-violet-500/15">
          {/* Close button */}
          <div className="mb-4 flex items-start justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30 shadow-md shadow-violet-500/15">
              <Bell className="h-5 w-5 text-violet-300" aria-hidden strokeWidth={2.25} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              aria-label="Închide"
              className="h-7 w-7 rounded-full text-hir-muted-fg transition-colors hover:bg-hir-surface hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
            >
              <X className="h-5 w-5" aria-hidden strokeWidth={2.25} />
            </Button>
          </div>

          <h2 className="text-base font-semibold tracking-tight text-hir-fg">
            Cere notificări ca să primești comenzi când ești online
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-hir-muted-fg">
            Primești comenzi instant, fără să ții aplicația deschisă. Poți dezactiva oricând din setările telefonului.
          </p>

          <div className="mt-5 flex flex-col gap-2">
            <Button
              type="button"
              onClick={handleEnable}
              disabled={phase === 'asking'}
              className="w-full rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white shadow-md shadow-violet-500/30 transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-lg hover:shadow-violet-500/40 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2 disabled:opacity-60 disabled:shadow-none disabled:hover:translate-y-0"
            >
              {phase === 'asking' ? 'Se activează…' : 'Activează notificările'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDismiss}
              disabled={phase === 'asking'}
              className="w-full rounded-xl border-hir-border py-3 text-sm font-medium text-hir-muted-fg transition-colors hover:border-hir-muted-fg/40 hover:bg-hir-surface hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
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

    let timer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    // Native shell owns push registration end-to-end. Don't show the
    // web-VAPID re-ask banner there.
    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) return;
      } catch {
        // @capacitor/core not loadable — fall through to web banner.
      }
      if (disposed) return;
      // Poll sessionStorage for the delivered flag (set by order-actions.tsx).
      // We poll rather than listen to a custom event so the banner still
      // works even when the tab navigates between pages within the session.
      timer = setInterval(() => {
        try {
          const flagged = sessionStorage.getItem(SESSION_DELIVERED_FLAG);
          if (flagged) {
            if (timer) clearInterval(timer);
            timer = null;
            setVisible(true);
          }
        } catch {
          if (timer) clearInterval(timer);
          timer = null;
        }
      }, 1500);
    })();

    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
    };
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
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-violet-500/40 bg-hir-bg/95 px-4 py-3 shadow-xl shadow-violet-500/20 ring-1 ring-inset ring-violet-500/15 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/15 ring-1 ring-violet-500/40"
          >
            <Bell className="h-3.5 w-3.5 text-violet-300" strokeWidth={2.25} />
          </span>
          <p className="text-xs leading-snug text-hir-fg">
            Primești alertă pentru comenzi noi chiar și cu ecranul stins
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleEnable}
            className="min-h-[44px] rounded-xl bg-violet-500 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-violet-500/30 transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-lg hover:shadow-violet-500/40 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            Activează
          </button>
          <button
            type="button"
            onClick={handleSnooze}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl px-2 py-2 text-hir-muted-fg transition-colors hover:bg-hir-surface hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
            aria-label="Amână notificarea"
          >
            <X className="h-4 w-4" aria-hidden strokeWidth={2.25} />
            <span className="sr-only">Mai târziu</span>
          </button>
        </div>
      </div>
    </div>
  );
}
