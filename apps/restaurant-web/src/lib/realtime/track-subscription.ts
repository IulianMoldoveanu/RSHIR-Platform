'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserSupabase } from './supabase-browser';

export type TrackBroadcastPayload = {
  order_id: string;
  status: string;
  updated_at: string;
};

export type TrackSubscriptionStatus =
  | 'idle'
  | 'connecting'
  | 'subscribed'
  | 'reconnecting'
  | 'closed';

/**
 * Subscribes to the per-token Supabase Realtime channel `track:<token>`
 * for instant order-status updates. The Edge Function `track-broadcast`
 * pushes a `status_change` event whenever the AFTER UPDATE trigger fires
 * on `restaurant_orders.status`.
 *
 * Falls back gracefully if the browser cannot reach Realtime — the track
 * page still polls every 30s via React Query, so this hook is purely an
 * "instant nudge" enhancement.
 *
 * Returns the connection status; the caller can hide it from users (no
 * banner needed) and use it only for diagnostics.
 */
export function useTrackBroadcast(
  token: string | null,
  onStatusChange: (payload: TrackBroadcastPayload) => void,
): TrackSubscriptionStatus {
  const [status, setStatus] = useState<TrackSubscriptionStatus>('idle');
  // Pin the latest callback so consumers don't have to memoize it.
  const cbRef = useRef(onStatusChange);
  cbRef.current = onStatusChange;

  useEffect(() => {
    if (!token) {
      setStatus('idle');
      return;
    }

    let supabase;
    try {
      supabase = getBrowserSupabase();
    } catch {
      // Supabase env not configured (e.g. local dev with no .env). The
      // 30s React Query poll continues to work; we just skip realtime.
      setStatus('closed');
      return;
    }
    setStatus('connecting');

    const channel: RealtimeChannel = supabase
      .channel(`track:${token}`)
      .on('broadcast', { event: 'status_change' }, (msg) => {
        const payload = msg?.payload as TrackBroadcastPayload | undefined;
        if (!payload || typeof payload.status !== 'string') return;
        cbRef.current(payload);
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') setStatus('subscribed');
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setStatus('reconnecting');
        else if (s === 'CLOSED') setStatus('closed');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [token]);

  return status;
}
