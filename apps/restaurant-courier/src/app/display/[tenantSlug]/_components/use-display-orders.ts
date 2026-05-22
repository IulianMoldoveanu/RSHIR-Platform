'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export type Zone = 'Z1' | 'Z2' | 'Z3' | 'Z4';

export type DisplayOrder = {
  id: string;
  status: string;
  customer_address: string | null;
  zone: Zone | null;
  delivery_fee_ron: number | null;
  created_at: string;
  assigned_courier_user_id: string | null;
  // Courier name — populated for accepted orders via join.
  courier_name: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  source_tenant_id: string;
};

// Orders available for self-pickup (unassigned, early statuses).
const AVAILABLE_STATUSES = ['CREATED', 'OFFERED'];
// Orders in-progress (assigned).
const ACTIVE_STATUSES = ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'];

export type DisplayOrdersResult = {
  available: DisplayOrder[];
  active: DisplayOrder[];
};

const BACKOFF_INITIAL = 1000;
const BACKOFF_MAX = 30_000;

export function useDisplayOrders(tenantId: string): DisplayOrdersResult {
  const [available, setAvailable] = useState<DisplayOrder[]>([]);
  const [active, setActive] = useState<DisplayOrder[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const backoffRef = useRef(BACKOFF_INITIAL);
  const unmountedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyUpsert = useCallback((row: DisplayOrder) => {
    const isAvailable = AVAILABLE_STATUSES.includes(row.status) && !row.assigned_courier_user_id;
    const isActive = ACTIVE_STATUSES.includes(row.status);

    setAvailable((prev) => {
      const without = prev.filter((o) => o.id !== row.id);
      if (isAvailable) {
        // Sort: zone asc then created_at asc.
        const next = [...without, row];
        next.sort((a, b) => {
          const za = a.zone ?? 'Z9';
          const zb = b.zone ?? 'Z9';
          if (za !== zb) return za < zb ? -1 : 1;
          return a.created_at < b.created_at ? -1 : 1;
        });
        return next;
      }
      return without;
    });

    setActive((prev) => {
      const without = prev.filter((o) => o.id !== row.id);
      if (isActive) return [...without, row];
      return without;
    });
  }, []);

  const applyRemove = useCallback((id: string) => {
    setAvailable((prev) => prev.filter((o) => o.id !== id));
    setActive((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const subscribe = useCallback(() => {
    if (unmountedRef.current) return;
    const supabase = getBrowserSupabase();

    // Initial fetch.
    supabase
      .from('courier_orders')
      .select('id, status, customer_address, zone, delivery_fee_ron, created_at, assigned_courier_user_id, courier_name:courier_profiles!assigned_courier_user_id(full_name), dropoff_lat, dropoff_lng, source_tenant_id')
      .eq('source_tenant_id', tenantId)
      .in('status', [...AVAILABLE_STATUSES, ...ACTIVE_STATUSES])
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (!data || unmountedRef.current) return;
        // Supabase join returns courier_name as array; flatten.
        const rows = data.map(flattenRow);
        setAvailable(rows.filter((r) => AVAILABLE_STATUSES.includes(r.status) && !r.assigned_courier_user_id));
        setActive(rows.filter((r) => ACTIVE_STATUSES.includes(r.status)));
      });

    const channel = supabase
      .channel(`display:${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'courier_orders',
          filter: `source_tenant_id=eq.${tenantId}`,
        },
        (payload) => applyUpsert(flattenRow(payload.new as RawRow)),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'courier_orders',
          filter: `source_tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const row = flattenRow(payload.new as RawRow);
          // CANCELLED/DELIVERED → remove entirely.
          if (['CANCELLED', 'DELIVERED', 'FAILED'].includes(row.status)) {
            applyRemove(row.id);
          } else {
            applyUpsert(row);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'courier_orders', filter: `source_tenant_id=eq.${tenantId}` },
        (payload) => applyRemove((payload.old as { id: string }).id),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          backoffRef.current = BACKOFF_INITIAL;
        }
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          if (!unmountedRef.current) {
            channelRef.current?.unsubscribe();
            channelRef.current = null;
            if (timerRef.current) clearTimeout(timerRef.current);
            const delay = backoffRef.current;
            backoffRef.current = Math.min(backoffRef.current * 2, BACKOFF_MAX);
            timerRef.current = setTimeout(subscribe, delay);
          }
        }
      });

    channelRef.current = channel;
  }, [tenantId, applyUpsert, applyRemove]);

  useEffect(() => {
    unmountedRef.current = false;
    subscribe();
    return () => {
      unmountedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
  }, [subscribe]);

  return { available, active };
}

// ---------- helpers ----------

type RawRow = Record<string, unknown>;

function flattenRow(raw: RawRow): DisplayOrder {
  // courier_profiles join comes back as array or object depending on query form.
  let courierName: string | null = null;
  const cp = raw.courier_name;
  if (Array.isArray(cp) && cp.length > 0) {
    courierName = (cp[0] as { full_name?: string | null }).full_name ?? null;
  } else if (cp && typeof cp === 'object') {
    courierName = (cp as { full_name?: string | null }).full_name ?? null;
  }

  return {
    id: String(raw.id),
    status: String(raw.status ?? ''),
    customer_address: (raw.customer_address as string | null) ?? null,
    zone: (raw.zone as Zone | null) ?? null,
    delivery_fee_ron: (raw.delivery_fee_ron as number | null) ?? null,
    created_at: String(raw.created_at ?? ''),
    assigned_courier_user_id: (raw.assigned_courier_user_id as string | null) ?? null,
    courier_name: courierName,
    dropoff_lat: (raw.dropoff_lat as number | null) ?? null,
    dropoff_lng: (raw.dropoff_lng as number | null) ?? null,
    source_tenant_id: String(raw.source_tenant_id ?? ''),
  };
}
