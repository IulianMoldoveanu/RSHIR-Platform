'use client';

// Wave 1.3 — Courier presence broadcaster (audit P0 #11 hardening).
//
// Per-fleet presence channel: each authenticated courier joins
// `presence:fleet:{fleet_id}` on app mount and tracks an in-memory
// presence record. Only members subscribed to the SAME fleet channel
// can read it, which closes the cross-fleet leak that existed when we
// broadcast on the global `couriers:presence` channel (any tenant with
// a Supabase session could enumerate every courier across every fleet).
//
// Payload deliberately omits `user_id` — identifying a specific courier
// is a server-side concern via the presence-snapshot endpoint. Realtime
// is for "how many are online right now" only.
//
// Couriers without a fleet (e.g. trial/sandbox accounts) get no channel.
// This matches the audit goal: no global broadcast.

import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export function CourierPresenceBroadcaster({
  userId,
  fleetId,
  cityId = null,
}: {
  userId: string;
  fleetId: string | null;
  cityId?: string | null;
}) {
  useEffect(() => {
    if (!userId || !fleetId) return;
    const supabase = getBrowserSupabase();
    const channel: RealtimeChannel = supabase.channel(`presence:fleet:${fleetId}`, {
      // Presence key is a hashed-ish unique id per session. We still need
      // SOME key for join/leave bookkeeping, but it MUST NOT be the user's
      // auth id (that would leak via `presenceState()` to other observers).
      // crypto.randomUUID is widely available on modern browsers; fallback
      // to a timestamp+random string for older WebView environments.
      config: { presence: { key: makePresenceKey() } },
    });

    const track = () =>
      channel.track({
        // Intentionally NO user_id — see top-of-file comment.
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
  }, [userId, fleetId, cityId]);

  return null;
}

function makePresenceKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to fallback
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
