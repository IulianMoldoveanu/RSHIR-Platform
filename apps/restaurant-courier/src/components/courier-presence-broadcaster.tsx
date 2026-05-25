'use client';

// Wave 1.3 — Courier presence broadcaster. Each authenticated courier joins
// the global `couriers:presence` Supabase Realtime channel on app mount and
// tracks an in-memory presence record. Tenants subscribed to the same
// channel can count members (see admin's courier-presence-widget).
//
// Two minor signals are tracked:
//   - status  : 'online' (default), 'busy' (set externally if needed later)
//   - city_id : optional, helps tenants filter by city in v2
//
// No DB writes; presence state lives entirely on Supabase Realtime servers
// and disappears on tab close / network drop. The page-visible listener
// re-tracks when the tab regains focus to recover from transient drops.

import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export function CourierPresenceBroadcaster({
  userId,
  cityId = null,
}: {
  userId: string;
  cityId?: string | null;
}) {
  useEffect(() => {
    if (!userId) return;
    const supabase = getBrowserSupabase();
    const channel: RealtimeChannel = supabase.channel('couriers:presence', {
      config: { presence: { key: userId } },
    });

    const track = () =>
      channel.track({
        user_id: userId,
        city_id: cityId,
        status: 'online',
        joined_at: new Date().toISOString(),
      });

    channel.subscribe((s) => {
      if (s === 'SUBSCRIBED') void track();
    });

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void track();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [userId, cityId]);

  return null;
}
