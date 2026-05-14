'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@hir/ui';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const REFRESH_THROTTLE_MS = 1500;

type Props = {
  orderId: string;
  viewerId: string;
  // Server-side snapshot of the order's assigned_courier_user_id when the
  // page first rendered. Used to detect "someone else just claimed this"
  // without needing the realtime payload to carry the prior assignee.
  initialAssignedTo: string | null;
  // Server-side snapshot of the order's status when the page first rendered.
  // Used to detect "this order was cancelled while I was looking at it".
  initialStatus: string;
};

type OrderRowPayload = {
  status?: string | null;
  assigned_courier_user_id?: string | null;
};

// Realtime race-guard for the detail view. Without this, two riders could
// both have the same OFFERED order open, both tap Accept, and the loser
// would silently submit a no-op server action with no in-app cue beyond a
// stale page. Now the loser sees a clear "Comanda a fost preluată" toast
// and the page reloads to the post-claim view (locked, can't accept).
//
// Also covers the cancellation case: if the order is cancelled out-of-band
// while the courier is looking at it, we surface a toast instead of letting
// them tap a stale Pickup/Deliver button against a CANCELLED row (which the
// atomic UPDATE in actions.ts would silently no-op anyway — better UX to
// tell the rider what just happened).
export function OrderDetailRealtime({
  orderId,
  viewerId,
  initialAssignedTo,
  initialStatus,
}: Props) {
  const router = useRouter();
  const lastRefreshRef = useRef(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Capture the "shape" of the order at first render so we know whether a
  // future event is a meaningful transition (e.g. open→claimed-by-peer).
  // Both kept in refs so they survive remounts without resetting on prop
  // changes triggered by router.refresh().
  const initialAssignedRef = useRef(initialAssignedTo);
  const initialStatusRef = useRef(initialStatus);
  const notifiedRef = useRef(false);

  useEffect(() => {
    const supabase = getBrowserSupabase();

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

    const handleUpdate = (payload: { new: OrderRowPayload }) => {
      const row = payload.new ?? {};
      const newAssignee = row.assigned_courier_user_id ?? null;
      const newStatus = row.status ?? null;

      // Race guard 1: I was looking at an unassigned/offered order, somebody
      // else just claimed it. Only fire once per page lifetime — the next
      // router.refresh will reset the initial refs effectively, but the
      // notified flag protects against burst-UPDATE noise.
      const wasUnclaimed = initialAssignedRef.current === null;
      const peerClaimed =
        wasUnclaimed && newAssignee !== null && newAssignee !== viewerId;
      if (peerClaimed && !notifiedRef.current) {
        notifiedRef.current = true;
        toast.error('Comanda a fost preluată de alt curier.', {
          duration: 5_000,
        });
      }

      // Race guard 2: cancellation while I had the page open. Surface it
      // regardless of whether the order was mine or in the open list.
      const wasNotCancelled = initialStatusRef.current !== 'CANCELLED';
      if (wasNotCancelled && newStatus === 'CANCELLED' && !notifiedRef.current) {
        notifiedRef.current = true;
        toast('Comanda a fost anulată.', { duration: 5_000 });
      }

      triggerRefresh();
    };

    const filter = `id=eq.${orderId}`;

    const channel = supabase
      .channel(`courier:order:detail:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'courier_orders', filter },
        handleUpdate,
      )
      .subscribe();

    return () => {
      if (pendingRef.current) {
        clearTimeout(pendingRef.current);
        pendingRef.current = null;
      }
      channel.unsubscribe();
    };
  }, [router, orderId, viewerId]);

  return null;
}
