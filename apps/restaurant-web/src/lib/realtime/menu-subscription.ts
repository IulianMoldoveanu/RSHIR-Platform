'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  RealtimeChannel,
  RealtimePostgresInsertPayload,
} from '@supabase/supabase-js';
import { getBrowserSupabase } from './supabase-browser';
import { useAvailabilityStore } from './availability-store';

type MenuEventRow = {
  id: number;
  tenant_id: string;
  item_id: string;
  is_available: boolean;
  at: string;
};

export type MenuSubscriptionStatus =
  | 'idle'
  | 'connecting'
  | 'subscribed'
  | 'reconnecting'
  | 'closed';

/**
 * Subscribes to `menu_events` INSERTs scoped to `tenantId` and pipes
 * each payload into `useAvailabilityStore`.
 *
 * Returns the connection status; consumers can render a small banner.
 * Emits `onReconnect()` after a connection loss → re-subscribe transition.
 */
export function useMenuAvailability(
  tenantId: string | null,
  opts?: { onReconnect?: () => void },
): MenuSubscriptionStatus {
  const [status, setStatus] = useState<MenuSubscriptionStatus>('idle');
  const setStoreEntry = useAvailabilityStore((s) => s.set);
  const wasSubscribedRef = useRef(false);
  const onReconnectRef = useRef(opts?.onReconnect);
  onReconnectRef.current = opts?.onReconnect;

  useEffect(() => {
    if (!tenantId) {
      setStatus('idle');
      return;
    }

    const supabase = getBrowserSupabase();
    setStatus('connecting');

    const channel: RealtimeChannel = supabase
      .channel(`tenant:${tenantId}:menu`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'menu_events',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload: RealtimePostgresInsertPayload<MenuEventRow>) => {
          const row = payload.new;
          if (row?.item_id) {
            setStoreEntry(row.item_id, row.is_available);
          }
        },
      )
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          if (wasSubscribedRef.current) {
            onReconnectRef.current?.();
          }
          wasSubscribedRef.current = true;
          setStatus('subscribed');
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
          setStatus('reconnecting');
        } else if (s === 'CLOSED') {
          setStatus('closed');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
      wasSubscribedRef.current = false;
    };
  }, [tenantId, setStoreEntry]);

  return status;
}
