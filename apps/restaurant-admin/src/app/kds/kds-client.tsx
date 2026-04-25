'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { updateOrderStatus } from '../dashboard/orders/actions';
import type { OrderStatus } from '../dashboard/orders/status-machine';

export type KdsOrder = {
  id: string;
  status: OrderStatus;
  items: unknown;
  notes: string | null;
  delivery_address_id: string | null;
  created_at: string;
  updated_at: string;
};

type Fulfillment = 'all' | 'delivery' | 'pickup';

type ItemSnapshot = {
  name?: string;
  qty?: number;
  quantity?: number;
  modifiers?: Array<{ name?: string }>;
};

const LEFT_COL: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING'];
const RIGHT_COL: OrderStatus[] = ['READY', 'DISPATCHED'];

const STATUS_LABEL_RO: Record<OrderStatus, string> = {
  PENDING: 'Nouă',
  CONFIRMED: 'Confirmată',
  PREPARING: 'În pregătire',
  READY: 'Gata',
  DISPATCHED: 'Trimisă',
  IN_DELIVERY: 'În livrare',
  DELIVERED: 'Livrată',
  CANCELLED: 'Anulată',
};

const STALE_MS = 10 * 60 * 1000;
const CHIME_COOLDOWN_MS = 3000;

function shortId(id: string): string {
  return id.slice(0, 8);
}

function fulfillmentOf(o: KdsOrder): 'delivery' | 'pickup' {
  return o.delivery_address_id ? 'delivery' : 'pickup';
}

function itemsOf(o: KdsOrder): ItemSnapshot[] {
  return Array.isArray(o.items) ? (o.items as ItemSnapshot[]) : [];
}

function elapsedLabel(iso: string, nowMs: number): string {
  const sec = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function nextForwardForKds(s: OrderStatus): OrderStatus | null {
  switch (s) {
    case 'PENDING':
      return 'CONFIRMED';
    case 'CONFIRMED':
      return 'PREPARING';
    case 'PREPARING':
      return 'READY';
    case 'READY':
      return 'DISPATCHED';
    default:
      return null;
  }
}

function forwardLabel(from: OrderStatus, fulfillment: 'delivery' | 'pickup'): string {
  switch (from) {
    case 'PENDING':
      return 'Confirmă';
    case 'CONFIRMED':
      return 'Începe pregătirea';
    case 'PREPARING':
      return 'Gata';
    case 'READY':
      return fulfillment === 'pickup' ? 'Predată' : 'Trimisă curierului';
    default:
      return '';
  }
}

export function KdsClient({
  tenantId,
  tenantName,
  initialOrders,
}: {
  tenantId: string;
  tenantName: string;
  initialOrders: KdsOrder[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Fulfillment>('all');
  const [now, setNow] = useState<number>(() => Date.now());

  // Tick the clock so elapsed times + stale indicator update without server round-trips.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastChimeRef = useRef<number>(0);

  useEffect(() => {
    if (!tenantId) return;
    const supabase = getBrowserSupabase();
    const channel: RealtimeChannel = supabase
      .channel(`kds:${tenantId}:orders`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'restaurant_orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          maybePlayChime();
          router.refresh();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'restaurant_orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  function maybePlayChime() {
    const t = Date.now();
    if (t - lastChimeRef.current < CHIME_COOLDOWN_MS) return;
    lastChimeRef.current = t;
    playChime(audioCtxRef);
  }

  const visible = useMemo(() => {
    if (filter === 'all') return initialOrders;
    return initialOrders.filter((o) => fulfillmentOf(o) === filter);
  }, [initialOrders, filter]);

  const left = visible.filter((o) => LEFT_COL.includes(o.status));
  const right = visible.filter((o) => RIGHT_COL.includes(o.status));

  return (
    <div className="flex min-h-screen flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">KDS — {tenantName}</h1>
          <span className="text-sm text-zinc-400">
            {visible.length} comenzi active
          </span>
        </div>
        <div className="flex items-center gap-3">
          <FilterPills value={filter} onChange={setFilter} />
          <Link
            href="/dashboard/orders"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Ieșire
          </Link>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <Column title="ÎN LUCRU" orders={left} now={now} router={router} tenantId={tenantId} />
        <Column title="GATA" orders={right} now={now} router={router} tenantId={tenantId} />
      </div>
    </div>
  );
}

function FilterPills({
  value,
  onChange,
}: {
  value: Fulfillment;
  onChange: (v: Fulfillment) => void;
}) {
  const opts: Array<{ v: Fulfillment; label: string }> = [
    { v: 'all', label: 'Toate' },
    { v: 'delivery', label: 'Livrare' },
    { v: 'pickup', label: 'Ridicare' },
  ];
  return (
    <nav className="flex items-center gap-1 rounded-md bg-zinc-900 p-1 text-sm ring-1 ring-zinc-800">
      {opts.map((o) => {
        const active = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={
              'rounded px-3 py-1.5 font-medium transition-colors ' +
              (active
                ? 'bg-zinc-100 text-zinc-900'
                : 'text-zinc-300 hover:text-white')
            }
          >
            {o.label}
          </button>
        );
      })}
    </nav>
  );
}

function Column({
  title,
  orders,
  now,
  router,
  tenantId,
}: {
  title: string;
  orders: KdsOrder[];
  now: number;
  router: ReturnType<typeof useRouter>;
  tenantId: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
        {title} <span className="text-zinc-600">({orders.length})</span>
      </h2>
      {orders.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-zinc-800 text-sm text-zinc-500">
          Nicio comandă.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} now={now} router={router} tenantId={tenantId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function OrderCard({
  order,
  now,
  router,
  tenantId,
}: {
  order: KdsOrder;
  now: number;
  router: ReturnType<typeof useRouter>;
  tenantId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fulfillment = fulfillmentOf(order);
  const items = itemsOf(order);
  const next = nextForwardForKds(order.status);
  const isStale = now - new Date(order.updated_at).getTime() > STALE_MS;

  const onAdvance = () => {
    if (!next) return;
    setError(null);
    startTransition(async () => {
      try {
        await updateOrderStatus(order.id, next, tenantId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Eroare necunoscută.');
      }
    });
  };

  return (
    <li
      className={
        'flex flex-col gap-3 rounded-lg border bg-zinc-900 p-4 shadow-md transition-colors ' +
        (isStale ? 'border-amber-500' : 'border-zinc-800')
      }
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-base text-zinc-400">#{shortId(order.id)}</span>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs uppercase tracking-wide text-zinc-300">
            {fulfillment === 'pickup' ? 'Ridicare' : 'Livrare'}
          </span>
          <span className="text-xs text-zinc-500">{STATUS_LABEL_RO[order.status]}</span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={
              'text-base font-semibold tabular-nums ' +
              (isStale ? 'text-amber-400' : 'text-zinc-200')
            }
          >
            {elapsedLabel(order.created_at, now)}
          </span>
          <Link
            href={`/kds/print/${order.id}`}
            target="_blank"
            className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
          >
            Tipărește
          </Link>
        </div>
      </header>

      {items.length > 0 && (
        <ul className="flex flex-col gap-1 text-lg leading-snug">
          {items.map((it, idx) => {
            const qty = Number(it.qty ?? it.quantity ?? 1);
            return (
              <li key={idx} className="flex flex-col">
                <span>
                  <span className="font-semibold text-white">{qty}×</span>{' '}
                  <span className="text-zinc-100">{it.name ?? 'Produs'}</span>
                </span>
                {Array.isArray(it.modifiers) && it.modifiers.length > 0 && (
                  <span className="ml-6 text-sm text-zinc-400">
                    + {it.modifiers.map((m) => m.name).filter(Boolean).join(', ')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {order.notes && (
        <p className="rounded-md bg-yellow-500/10 px-3 py-2 text-base font-medium text-yellow-300 ring-1 ring-yellow-500/30">
          ⚠ {order.notes}
        </p>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2">
        {error && <span className="text-xs text-rose-400">{error}</span>}
        {next ? (
          <button
            type="button"
            onClick={onAdvance}
            disabled={pending}
            className="ml-auto inline-flex h-12 items-center justify-center rounded-md bg-emerald-500 px-5 text-base font-semibold text-emerald-950 transition-colors hover:bg-emerald-400 disabled:opacity-60"
          >
            {pending ? '...' : forwardLabel(order.status, fulfillment)}
          </button>
        ) : (
          <span className="ml-auto text-xs text-zinc-500">{STATUS_LABEL_RO[order.status]}</span>
        )}
      </footer>
    </li>
  );
}

function playChime(audioCtxRef: { current: AudioContext | null }) {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    let ctx = audioCtxRef.current;
    if (!ctx) {
      ctx = new Ctor();
      audioCtxRef.current = ctx;
    }
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
    /* best-effort */
  }
}
