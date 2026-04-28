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
export function OrdersRealtime({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const unreadRef = useRef(0);
  const baseTitleRef = useRef<string>('');
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    baseTitleRef.current = document.title.replace(/^\(\d+\)\s*/, '');
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {
        /* user dismissed — ignore */
      });
    }

    const onFocus = () => {
      unreadRef.current = 0;
      document.title = baseTitleRef.current;
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
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
      .subscribe((status) => {
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
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  function handleNewOrder(row: OrderInsertRow) {
    const shortId = row.id.slice(0, 8);
    const totalRon = Number(row.total_ron ?? 0).toFixed(2);

    if (!document.hasFocus()) {
      unreadRef.current += 1;
      document.title = `(${unreadRef.current}) ${baseTitleRef.current || 'HIR Admin'}`;
    }

    playChime();

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
