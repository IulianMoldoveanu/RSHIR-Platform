'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import type { LiveOrder, DaySummary, ZoneDistribution, CourierOrderStatus } from '../page';
import { SummaryHeader } from './summary-header';
import { FilterChips } from './filter-chips';
import { OrdersTable } from './orders-table';
import { ActivityTimeline } from './activity-timeline';
import { StatsPanel } from './stats-panel';

// Map is heavy — load after initial render.
const LiveOrdersMap = dynamic(() => import('./live-orders-map').then((m) => m.LiveOrdersMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-sm text-zinc-400 lg:h-full">
      Hartă în curs de încărcare...
    </div>
  ),
});

export type FilterTab = 'all' | 'active' | 'delivered' | 'cancelled';

const ACTIVE_SET: Set<CourierOrderStatus> = new Set([
  'CREATED',
  'OFFERED',
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
]);

function applyFilter(orders: LiveOrder[], tab: FilterTab, search: string): LiveOrder[] {
  let list = orders;
  if (tab === 'active') list = list.filter((o) => ACTIVE_SET.has(o.status));
  else if (tab === 'delivered') list = list.filter((o) => o.status === 'DELIVERED');
  else if (tab === 'cancelled') list = list.filter((o) => o.status === 'CANCELLED');

  if (search.trim()) {
    const q = search.toLowerCase();
    list = list.filter(
      (o) =>
        (o.dropoff_line1 ?? '').toLowerCase().includes(q) ||
        (o.customer_phone ?? '').includes(q) ||
        (o.customer_first_name ?? '').toLowerCase().includes(q),
    );
  }
  return list;
}

type Props = {
  tenantId: string;
  tenantName: string;
  orders: LiveOrder[];
  summary: DaySummary;
  yesterdaySummary: DaySummary | null;
  zoneDistribution: ZoneDistribution[];
  range: 'today' | 'yesterday' | 'week';
  // ISO bounds of the active server-side query window. Realtime inserts
  // outside these bounds (e.g. fresh orders arriving while viewing 'yesterday')
  // must be ignored so KPIs and lists stay coherent with the chosen range.
  windowFromIso: string;
  windowToIso: string;
};

export function LiveOrdersClient({
  tenantId,
  tenantName,
  orders: initialOrders,
  summary: initialSummary,
  yesterdaySummary,
  zoneDistribution,
  range,
  windowFromIso,
  windowToIso,
}: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState<LiveOrder[]>(initialOrders);
  const [summary, setSummary] = useState<DaySummary>(initialSummary);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');
  const [chimeEnabled, setChimeEnabled] = useState(true);
  // IDs of recently-changed orders to highlight.
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  // 30-second auto-refresh timer ref.
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Sync orders/summary when server re-renders (router.refresh).
  useEffect(() => {
    setOrders(initialOrders);
    setSummary(initialSummary);
  }, [initialOrders, initialSummary]);

  // 30-second auto-refresh (server re-render to pick up changes not yet
  // reflected by the realtime channel — e.g. new orders created while
  // the tab was backgrounded).
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      router.refresh();
    }, 30_000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [router]);

  function playChime() {
    if (!chimeEnabled) return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctor();
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      const tones = [
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
      // best-effort
    }
  }

  const handleRealtimeOrder = useCallback(
    (incoming: Partial<LiveOrder> & { id: string; status: string; created_at?: string }) => {
      // Drop events outside the active time window. The Supabase channel is
      // filtered only by source_tenant_id, so without this guard a fresh
      // INSERT/UPDATE would pollute the 'yesterday' view (and skew totals)
      // with orders that don't belong to the rendered range.
      if (incoming.created_at) {
        const ts = new Date(incoming.created_at).getTime();
        if (
          Number.isFinite(ts) &&
          (ts < new Date(windowFromIso).getTime() ||
            ts > new Date(windowToIso).getTime())
        ) {
          return;
        }
      }

      const isNew = !orders.some((o) => o.id === incoming.id);
      if (isNew) playChime();

      setOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === incoming.id);
        if (idx === -1) {
          // New order — prepend with defaults for missing fields.
          const newOrder: LiveOrder = {
            courier_name: null,
            courier_phone: null,
            customer_first_name: null,
            customer_phone: null,
            delivery_fee_ron: null,
            dropoff_lat: null,
            dropoff_lng: null,
            dropoff_line1: null,
            items: [],
            payment_method: null,
            pickup_line1: null,
            total_ron: null,
            ...incoming,
            status: incoming.status as CourierOrderStatus,
          } as LiveOrder;
          return [newOrder, ...prev];
        }
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...incoming, status: incoming.status as CourierOrderStatus };
        return updated;
      });

      // Highlight the changed row for 2 seconds.
      setHighlightIds((prev) => {
        const next = new Set(prev);
        next.add(incoming.id);
        return next;
      });
      setTimeout(() => {
        setHighlightIds((prev) => {
          const next = new Set(prev);
          next.delete(incoming.id);
          return next;
        });
      }, 2_000);

      // Recompute summary counts from the updated orders state.
      // We let the server re-render handle exact numbers; this is optimistic.
      setSummary((prev) => {
        if (isNew) return { ...prev, total: prev.total + 1, active: prev.active + 1 };
        return prev;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, chimeEnabled, windowFromIso, windowToIso],
  );

  // Supabase Realtime subscription for courier_orders filtered by source_tenant_id.
  useEffect(() => {
    if (!tenantId) return;
    const supabase = getBrowserSupabase();

    const channel: RealtimeChannel = supabase
      .channel(`tenant:${tenantId}:courier_orders`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'courier_orders',
          filter: `source_tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          handleRealtimeOrder(payload.new as LiveOrder);
          router.refresh();
        },
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
          handleRealtimeOrder(payload.new as LiveOrder);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId, handleRealtimeOrder, router]);

  const filtered = applyFilter(orders, filter, search);

  // Build CSV export (today's orders only).
  function handleExportCsv() {
    const header = [
      'ID',
      'Status',
      'Adresa client',
      'Client',
      'Telefon',
      'Total RON',
      'Curier',
      'Creat la',
    ].join(',');
    const rows = filtered.map((o) =>
      [
        o.id.slice(0, 8),
        o.status,
        `"${(o.dropoff_line1 ?? '').replace(/"/g, '""')}"`,
        `"${(o.customer_first_name ?? '').replace(/"/g, '""')}"`,
        o.customer_phone ?? '',
        o.total_ron ?? '',
        `"${(o.courier_name ?? 'Neasignat').replace(/"/g, '""')}"`,
        new Date(o.created_at).toLocaleString('ro-RO'),
      ].join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comenzi-${tenantName}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const inTransitOrders = orders.filter((o) => o.status === 'IN_TRANSIT');

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Livrări live
          </h1>
          <p className="text-sm text-zinc-500">{tenantName} — vizibilitate operațională în timp real</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangePills active={range} />
          <button
            type="button"
            onClick={() => setChimeEnabled((v) => !v)}
            aria-label={chimeEnabled ? 'Dezactivează sunetul pentru comenzi noi' : 'Activează sunetul pentru comenzi noi'}
            title={chimeEnabled ? 'Sunet activ — click pentru a dezactiva' : 'Sunet dezactivat — click pentru a activa'}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              chimeEnabled
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-50'
            }`}
          >
            {chimeEnabled ? 'Sunet ON' : 'Sunet OFF'}
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Exporta comenzile
          </button>
        </div>
      </header>

      {/* Summary counts with yesterday comparison */}
      <SummaryHeader summary={summary} yesterdaySummary={yesterdaySummary} />

      {/* Filter chips + search */}
      <div className="flex flex-wrap items-center gap-3">
        <FilterChips active={filter} onChange={setFilter} orders={orders} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cauta dupa adresa sau telefon..."
          aria-label="Cauta comenzi dupa adresa sau telefon"
          className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500 sm:w-64"
        />
      </div>

      {/* Mobile tab switcher */}
      <div className="flex gap-1 rounded-md bg-zinc-100 p-1 text-xs lg:hidden">
        {(['list', 'map'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setMobileTab(t)}
            aria-pressed={mobileTab === t}
            className={`flex-1 rounded py-1.5 font-medium transition-colors ${
              mobileTab === t
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            {t === 'list' ? 'Lista comenzi' : 'Harta'}
          </button>
        ))}
      </div>

      {/* Main content: list + map side by side on desktop */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* Orders list */}
        <div className={`flex flex-col gap-4 lg:flex-1 ${mobileTab === 'map' ? 'hidden lg:flex' : ''}`}>
          <OrdersTable
            orders={filtered}
            highlightIds={highlightIds}
            selectedOrderId={selectedOrderId}
            onSelect={setSelectedOrderId}
          />
        </div>

        {/* Right panel: map + stats + timeline */}
        <div className={`flex flex-col gap-4 lg:w-96 ${mobileTab === 'list' ? 'hidden lg:flex' : ''}`}>
          {/* Map — only shows IN_TRANSIT orders' dropoff pins */}
          <div className="h-64 overflow-hidden rounded-xl border border-zinc-200 lg:h-80">
            <LiveOrdersMap
              orders={inTransitOrders}
              selectedOrderId={selectedOrderId}
              onSelectOrder={setSelectedOrderId}
            />
          </div>

          {/* Stats panel */}
          <StatsPanel summary={summary} zoneDistribution={zoneDistribution} />

          {/* Activity timeline */}
          <ActivityTimeline orders={orders} />
        </div>
      </div>
    </div>
  );
}

function RangePills({ active }: { active: string }) {
  const pills: Array<{ value: string; label: string; href: string }> = [
    { value: 'today', label: 'Azi', href: '/dashboard/operations/live-orders' },
    { value: 'yesterday', label: 'Ieri', href: '/dashboard/operations/live-orders?range=yesterday' },
    { value: 'week', label: 'Ultima saptamana', href: '/dashboard/operations/live-orders?range=week' },
  ];
  return (
    <nav aria-label="Interval de timp" className="flex items-center gap-1 rounded-md bg-zinc-100 p-1 text-xs">
      {pills.map((p) => (
        <a
          key={p.value}
          href={p.href}
          aria-current={active === p.value ? 'page' : undefined}
          className={`rounded px-3 py-1.5 font-medium transition-colors ${
            active === p.value
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          {p.label}
        </a>
      ))}
    </nav>
  );
}
