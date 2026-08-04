'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { armOfferAudio, isOfferSoundEnabled, playOfferAlarm, playMessageChime } from '@/lib/offer-sound';
import * as haptics from '@/lib/haptics';

const REFRESH_THROTTLE_MS = 1500;

type Props = {
  courierUserId: string;
  // courier_orders.id of this rider's currently active orders (OFFERED/
  // ACCEPTED/PICKED_UP/IN_TRANSIT). Used to watch order_messages for an
  // incoming client chat message — the chat only lives on the per-order
  // detail page, so without this the rider has no cue a client wrote
  // anything unless they happen to open that page.
  activeOrderIds: string[];
};

// Subscribes to changes on courier_orders rows assigned to this courier.
// (decision_pull_dispatch_eliminated_2026-08-04 removed the fleet-wide
// open-pool subscription that used to live here — riders no longer browse
// an unassigned pool, so there is nothing fleet-wide left to watch.)
export function OrdersRealtime({
  courierUserId,
  activeOrderIds,
}: Props) {
  const router = useRouter();
  const lastRefreshRef = useRef(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabase();

    // Unlock WebAudio so the new-order alarm actually sounds when an offer
    // lands while the courier is idle (mobile blocks audio until a gesture
    // has resumed the context). Idempotent — safe to call on every mount.
    armOfferAudio();

    const triggerRefresh = () => {
      const now = Date.now();
      const elapsed = now - lastRefreshRef.current;
      if (elapsed >= REFRESH_THROTTLE_MS) {
        lastRefreshRef.current = now;
        router.refresh();
        return;
      }
      if (pendingRef.current) return;
      pendingRef.current = setTimeout(() => {
        pendingRef.current = null;
        lastRefreshRef.current = Date.now();
        router.refresh();
      }, REFRESH_THROTTLE_MS - elapsed);
    };

    type OrderRowPayload = {
      status?: string | null;
      assigned_courier_user_id?: string | null;
    };

    // A directed offer landed for THIS courier (CREATED→OFFERED, assigned to
    // me). The big swipe-to-accept overlay lives on the home/map tab, so a
    // personally-assigned job could otherwise go unnoticed — easy to miss on
    // a bike mount. Announce it with sound + a vibration.
    const triggerOnAssignedActivity = (payload: { new: OrderRowPayload }) => {
      const row = payload.new ?? {};
      if (row.status === 'OFFERED') {
        if (isOfferSoundEnabled()) playOfferAlarm();
        try {
          haptics.custom([0, 140, 70, 140]);
        } catch {
          // haptics unavailable — non-fatal.
        }
      }
      triggerRefresh();
    };

    const assignedFilter = `assigned_courier_user_id=eq.${courierUserId}`;

    const channel = supabase
      .channel(`courier:orders:auto-refresh:${courierUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'courier_orders', filter: assignedFilter },
        triggerOnAssignedActivity,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'courier_orders', filter: assignedFilter },
        triggerOnAssignedActivity,
      );

    // Codex review (PR #1054, P2): when a directed offer times out,
    // revoke_expired_courier_offers() clears assigned_courier_user_id as
    // part of the same UPDATE that reverts status to CREATED. Postgres
    // Realtime filters test the NEW row, so that update no longer matches
    // assignedFilter above and the courier never hears about their own
    // offer expiring — the swipe-to-accept overlay would stay stale until
    // navigation or a failed accept attempt. Watch the specific order ids
    // already known to be relevant to this rider (by id, not by assignee)
    // so a clearing update still reaches them.
    if (activeOrderIds.length > 0 && activeOrderIds.length <= 50) {
      const idFilter = `id=in.(${activeOrderIds.join(',')})`;
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'courier_orders', filter: idFilter },
        () => triggerRefresh(),
      );
    }

    // Client chat messages on this rider's active orders. The chat UI only
    // exists on /dashboard/orders/[id] — without this, a message from the
    // client is silent until the rider happens to open that page. Chimes +
    // vibrates + refreshes so the home-screen badge (isClientMessageUnread)
    // picks it up. Skipped when there are no active orders (nothing to
    // filter on) or too many for a realtime `in.(...)` filter to stay sane.
    type MessageRowPayload = { from_role?: string; channel?: string };
    if (activeOrderIds.length > 0 && activeOrderIds.length <= 50) {
      const messagesFilter = `courier_order_id=in.(${activeOrderIds.join(',')})`;
      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_messages', filter: messagesFilter },
        (payload: { new: MessageRowPayload }) => {
          const row = payload.new ?? {};
          if (row.from_role !== 'CLIENT' || row.channel !== 'CLIENT_COURIER') return;
          if (isOfferSoundEnabled()) playMessageChime();
          try {
            haptics.attention();
          } catch {
            // haptics unavailable — non-fatal.
          }
          triggerRefresh();
        },
      );
    }

    channel.subscribe();

    return () => {
      if (pendingRef.current) {
        clearTimeout(pendingRef.current);
        pendingRef.current = null;
      }
      // Audit B21: `channel.unsubscribe()` closes the websocket leg but
      // leaves the channel registered with the client, which leaks a slot
      // on every shift change / fleet flip and eventually trips Supabase's
      // per-client channel cap. `removeChannel` does both.
      void supabase.removeChannel(channel);
    };
  }, [router, courierUserId, activeOrderIds]);

  return null;
}
