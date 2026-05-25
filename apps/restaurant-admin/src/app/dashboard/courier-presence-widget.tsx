'use client';

// Wave 1.3 — Read-only mirror of the courier presence channel for the
// tenant dashboard. Counts how many couriers are currently broadcasting
// 'online' on the global couriers:presence channel and renders a small
// status pill on the homepage.

import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Bike } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/browser';

type Snapshot = { count: number; cities: Record<string, number> };

export function CourierPresenceWidget() {
  const [snap, setSnap] = useState<Snapshot>({ count: 0, cities: {} });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    const channel: RealtimeChannel = supabase.channel('couriers:presence', {
      config: { presence: { key: 'observer:tenant-dashboard' } },
    });

    const recompute = () => {
      const state = channel.presenceState();
      let count = 0;
      const cities: Record<string, number> = {};
      for (const key of Object.keys(state)) {
        if (key.startsWith('observer:')) continue;
        const presences = state[key] as Array<{ city_id?: string | null }>;
        if (presences && presences.length > 0) {
          count += 1;
          const city = presences[0].city_id ?? '_unknown';
          cities[city] = (cities[city] ?? 0) + 1;
        }
      }
      setSnap({ count, cities });
    };

    channel
      .on('presence', { event: 'sync' }, recompute)
      .on('presence', { event: 'join' }, recompute)
      .on('presence', { event: 'leave' }, recompute)
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          setConnected(true);
          // Track ourselves under an observer key so the channel stays open
          // even if no couriers are online yet.
          void channel.track({ role: 'observer' });
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
          setConnected(false);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  if (!connected) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <Bike className="h-3.5 w-3.5" aria-hidden />
      {snap.count === 0
        ? 'Niciun curier online'
        : snap.count === 1
          ? '1 curier online'
          : `${snap.count} curieri online`}
    </div>
  );
}
