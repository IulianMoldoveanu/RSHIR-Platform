'use client';

// Client half of CourierPresenceWidget (audit P0 #11).
//
// Opens one `presence:fleet:{fleet_id}` channel per fleet the tenant has
// an assignment to, aggregates the join/sync/leave events into a single
// online count, and renders the same emerald pill as before.
//
// The observer tracks itself under a transient `observer:*` key so the
// channel doesn't time out when no couriers are online, but we filter
// observer keys back out when counting. The observer payload contains no
// PII (just role:observer).

import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Bike } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export function CourierPresenceWidgetClient({ fleetIds }: { fleetIds: string[] }) {
  const [snap, setSnap] = useState<{ count: number }>({ count: 0 });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (fleetIds.length === 0) return;

    const supabase = getBrowserSupabase();
    const channels: RealtimeChannel[] = [];
    // Per-channel snapshot so the aggregate count is just a sum.
    const counts = new Map<string, number>();

    const recomputeAggregate = () => {
      let total = 0;
      for (const c of counts.values()) total += c;
      setSnap({ count: total });
    };

    let connectedChannels = 0;

    for (const fleetId of fleetIds) {
      const channel = supabase.channel(`presence:fleet:${fleetId}`, {
        config: { presence: { key: `observer:tenant:${fleetId}` } },
      });

      const recomputeOne = () => {
        const state = channel.presenceState();
        let c = 0;
        for (const key of Object.keys(state)) {
          if (key.startsWith('observer:')) continue;
          const presences = state[key] as Array<unknown>;
          if (presences && presences.length > 0) c += 1;
        }
        counts.set(fleetId, c);
        recomputeAggregate();
      };

      channel
        .on('presence', { event: 'sync' }, recomputeOne)
        .on('presence', { event: 'join' }, recomputeOne)
        .on('presence', { event: 'leave' }, recomputeOne)
        .subscribe((s) => {
          if (s === 'SUBSCRIBED') {
            connectedChannels += 1;
            if (connectedChannels === fleetIds.length) setConnected(true);
            void channel.track({ role: 'observer' });
          } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
            // Don't downgrade the badge to disconnected on a single
            // channel hiccup — Supabase will auto-retry; the badge
            // only matters for first-paint UX.
          }
        });

      channels.push(channel);
    }

    return () => {
      for (const ch of channels) {
        void supabase.removeChannel(ch);
      }
    };
  }, [fleetIds]);

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
