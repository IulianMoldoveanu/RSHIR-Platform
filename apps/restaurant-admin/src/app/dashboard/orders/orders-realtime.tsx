'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type {
  RealtimeChannel,
  RealtimePostgresInsertPayload,
} from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/browser';

type OrderInsertRow = {
  id: string;
  tenant_id: string;
  total_ron: number | string | null;
};

/**
 * Subscribes to `restaurant_orders` INSERTs for the active tenant.
 * On each new order:
 *  - calls `router.refresh()` to refetch the server-rendered list
 *  - plays a short WebAudio chime
 *  - shows a Notification (if permission granted)
 *  - increments a counter in the document title until the tab is focused.
 */
// Audit P18 — UPDATE-driven refresh throttle. When a courier walks a route
// the dashboard gets a UPDATE stream every few seconds (status, GPS
// breadcrumbs propagated by triggers, etc.). Each one used to fire a full
// `router.refresh()` → SSR round-trip. We coalesce burst UPDATEs into at
// most one refresh per window. INSERTs are NOT throttled — a brand-new
// order is the moment the operator must hear the chime and see the row.
const UPDATE_REFRESH_THROTTLE_MS = 2000;

export function OrdersRealtime({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const unreadRef = useRef(0);
  const baseTitleRef = useRef<string>('');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashEndRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUpdateRefreshRef = useRef(0);
  const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopFlash() {
    if (flashTimerRef.current !== null) {
      clearInterval(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    if (flashEndRef.current !== null) {
      clearTimeout(flashEndRef.current);
      flashEndRef.current = null;
    }
    document.title = baseTitleRef.current || 'HIR Admin';
  }

  function startFlash(count: number) {
    stopFlash();
    let show = true;
    const label = `(${count}) HIR Admin`;
    document.title = label;
    flashTimerRef.current = setInterval(() => {
      show = !show;
      document.title = show ? label : (baseTitleRef.current || 'HIR Admin');
    }, 1000);
    flashEndRef.current = setTimeout(stopFlash, 30_000);
  }

  useEffect(() => {
    baseTitleRef.current = document.title.replace(/^\(\d+\)\s*/, '');
    // P0 audit #15 — DO NOT auto-call Notification.requestPermission() at
    // mount. Chrome 95+/Firefox/Safari ignore (or hard-reject) permission
    // prompts that are not tied to a user gesture, so the prompt silently
    // never appears and the admin thinks alerts are broken. The explicit
    // "Activează alerte" button (notification-permission-button.tsx) is
    // the gesture path now.

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        unreadRef.current = 0;
        stopFlash();
      }
    };
    const onFocus = () => {
      unreadRef.current = 0;
      stopFlash();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      stopFlash();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!tenantId) return;

    const supabase = getBrowserSupabase();
    const channel: RealtimeChannel = supabase
      .channel(`tenant:${tenantId}:orders`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'restaurant_orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload: RealtimePostgresInsertPayload<OrderInsertRow>) => {
          const row = payload.new;
          handleNewOrder(row);
          router.refresh();
        },
      )
      // Wave 1.1 — also pick up UPDATE events so the list reflects
      // courier-driven status changes (PICKED_UP → IN_DELIVERY → DELIVERED)
      // without the user having to refresh. No chime / flash here — that's
      // reserved for INSERT (genuinely new orders).
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'restaurant_orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          // Audit P18 — leading-edge throttle: fire immediately if the
          // window has elapsed since the last refresh, otherwise schedule
          // a single trailing refresh so the final UPDATE in a burst still
          // lands on screen. Coalesces dozens of breadcrumb-driven
          // UPDATEs/min into ~1 SSR round-trip every 2s.
          const now = Date.now();
          const elapsed = now - lastUpdateRefreshRef.current;
          if (elapsed >= UPDATE_REFRESH_THROTTLE_MS) {
            lastUpdateRefreshRef.current = now;
            router.refresh();
            return;
          }
          if (pendingUpdateRef.current) return;
          pendingUpdateRef.current = setTimeout(() => {
            pendingUpdateRef.current = null;
            lastUpdateRefreshRef.current = Date.now();
            router.refresh();
          }, UPDATE_REFRESH_THROTTLE_MS - elapsed);
        },
      )
      .subscribe((status: string) => {
        // After a CHANNEL_ERROR / TIMED_OUT and the client auto-reconnects,
        // the channel re-subscribes — but any orders inserted while we were
        // disconnected won't replay through this stream. Force a single
        // server fetch so the queue catches up after a transient outage.
        if (status === 'SUBSCRIBED') {
          router.refresh();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[orders-realtime] channel disrupted:', status);
        }
      });

    return () => {
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
        pendingUpdateRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  function handleNewOrder(row: OrderInsertRow) {
    const shortId = row.id.slice(0, 8);
    const totalRon = Number(row.total_ron ?? 0).toFixed(2);
    const quiet =
      typeof localStorage !== 'undefined' && localStorage.getItem('hir_admin_quiet') === '1';

    if (!document.hasFocus()) {
      unreadRef.current += 1;
      startFlash(unreadRef.current);
    }

    if (!quiet) {
      playChime();
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(`Comanda noua — #${shortId} — ${totalRon} RON`, {
          tag: `order-${row.id}`,
        });
      } catch {
        /* notification API can throw on some browsers — ignore */
      }
    }
  }

  function playChime() {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      let ctx = audioCtxRef.current;
      if (!ctx) {
        ctx = new Ctor();
        audioCtxRef.current = ctx;
      }
      const now = ctx.currentTime;
      // Two-tone chime: 880Hz then 1320Hz, ~250ms total.
      const tones: Array<{ freq: number; start: number; dur: number }> = [
        { freq: 880, start: 0, dur: 0.12 },
        { freq: 1320, start: 0.12, dur: 0.18 },
      ];
      for (const t of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(t.freq, now + t.start);
        gain.gain.setValueAtTime(0, now + t.start);
        gain.gain.linearRampToValueAtTime(0.18, now + t.start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + t.start);
        osc.stop(now + t.start + t.dur + 0.02);
      }
    } catch {
      /* chime is best-effort; ignore failures */
    }
  }

  return null;
}
