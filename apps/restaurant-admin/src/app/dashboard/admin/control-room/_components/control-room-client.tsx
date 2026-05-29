'use client';

// Control Room client — Iulian dashboard (platform admin).
// Auto-refreshes every 30s. All data fetched via /api/admin/control-room.

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

type Profile = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: string;
  max_parallel_orders?: number | null;
};

type Shift = {
  courier_user_id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: string | null;
};

type Order = {
  id: string;
  source_tenant_id: string;
  assigned_courier_user_id: string | null;
  status: string;
  delivery_fee_ron: number | null;
  customer_address: string | null;
  pickup_address: string | null;
  created_at: string;
  picked_up_at: string | null;
  delivered_at: string | null;
};

type Snapshot = {
  profiles: Profile[];
  shifts: Shift[];
  orders: Order[];
  fetched_at: string;
};

const IN_FLIGHT = new Set(['OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);
const UNASSIGNED = new Set(['CREATED', 'OFFERED']);

function relTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'acum';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`;
  return `${Math.floor(diff / 86_400_000)} z`;
}

export function ControlRoomClient({ initialData }: { initialData: Snapshot }) {
  const [data, setData] = useState<Snapshot>(initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/admin/control-room', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Snapshot;
      setData(json);
      setLastError(null);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'refresh failed');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  const onlineByUser = useMemo(() => {
    const map = new Map<string, Shift>();
    for (const s of data.shifts) {
      if (s.status === 'ONLINE' && !s.ended_at) map.set(s.courier_user_id, s);
    }
    return map;
  }, [data.shifts]);

  const ordersInFlight = data.orders.filter((o) => IN_FLIGHT.has(o.status));
  const ordersUnassigned = data.orders.filter(
    (o) => UNASSIGNED.has(o.status) && !o.assigned_courier_user_id,
  );
  const ordersDelivered = data.orders.filter((o) => o.status === 'DELIVERED').length;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Control Room</h1>
          <p className="text-sm text-zinc-600">Operațiuni curieri live — refresh 30s</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>Actualizat: {relTime(data.fetched_at)} în urmă</span>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
          >
            {refreshing ? 'Se reîncarcă…' : 'Reîncarcă'}
          </button>
        </div>
      </header>

      {lastError && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          Eroare la refresh: {lastError}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Curieri online" value={onlineByUser.size} accent="emerald" />
        <Stat label="Comenzi în curs" value={ordersInFlight.length} accent="amber" />
        <Stat label="Neasignate" value={ordersUnassigned.length} accent="rose" />
        <Stat label="Livrate azi" value={ordersDelivered} accent="zinc" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <CourierPanel
          profiles={data.profiles}
          onlineByUser={onlineByUser}
          onRefresh={refresh}
        />
        <OrdersPanel
          orders={data.orders}
          profiles={data.profiles}
          onRefresh={refresh}
        />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'emerald' | 'amber' | 'rose' | 'zinc';
}) {
  const accents: Record<typeof accent, string> = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    rose: 'text-rose-700',
    zinc: 'text-zinc-700',
  };
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${accents[accent]}`}>{value}</div>
    </div>
  );
}

function CourierPanel({
  profiles,
  onlineByUser,
  onRefresh,
}: {
  profiles: Profile[];
  onlineByUser: Map<string, Shift>;
  onRefresh: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const updateLimit = useCallback(
    (profileId: string, value: number | null) => {
      startTransition(async () => {
        setError(null);
        const res = await fetch(`/api/admin/couriers/${profileId}/max-parallel`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ max_parallel_orders: value }),
        });
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          return;
        }
        onRefresh();
      });
    },
    [onRefresh],
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">Curieri ({profiles.length})</h2>
      </div>
      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-800">
          {error}
        </div>
      )}
      <ul className="divide-y divide-zinc-100">
        {profiles.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-zinc-500">Nici un curier activ.</li>
        )}
        {profiles.map((p) => {
          const shift = onlineByUser.get(p.user_id);
          const online = !!shift;
          return (
            <li key={p.user_id} className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  online ? 'bg-emerald-500' : 'bg-zinc-300'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-900">
                  {p.full_name ?? 'Curier'}
                </div>
                <div className="text-xs text-zinc-500">
                  {p.phone ?? '—'} · last seen {relTime(shift?.last_seen_at ?? null)}
                </div>
              </div>
              <label className="text-xs text-zinc-500" htmlFor={`limit-${p.user_id}`}>
                Max paralel
              </label>
              <input
                id={`limit-${p.user_id}`}
                type="number"
                min={1}
                max={10}
                defaultValue={p.max_parallel_orders ?? ''}
                placeholder="∞"
                className="w-14 rounded border border-zinc-300 px-2 py-1 text-center text-sm tabular-nums"
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const value = raw === '' ? null : Math.max(1, Math.min(10, Number(raw)));
                  if (value !== (p.max_parallel_orders ?? null)) {
                    updateLimit(p.user_id, value);
                  }
                }}
                disabled={pending}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OrdersPanel({
  orders,
  profiles,
  onRefresh,
}: {
  orders: Order[];
  profiles: Profile[];
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'unassigned' | 'in_flight' | 'stale'>('all');
  const [reassigning, setReassigning] = useState<string | null>(null);

  const nameByUserId = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles) m.set(p.user_id, p.full_name ?? 'Curier');
    return m;
  }, [profiles]);

  const filtered = orders.filter((o) => {
    if (filter === 'unassigned') return UNASSIGNED.has(o.status) && !o.assigned_courier_user_id;
    if (filter === 'in_flight') return IN_FLIGHT.has(o.status);
    if (filter === 'stale') {
      if (!IN_FLIGHT.has(o.status)) return false;
      return Date.now() - new Date(o.created_at).getTime() > 5 * 60_000;
    }
    return true;
  });

  const reassign = useCallback(
    async (orderId: string, courierUserId: string) => {
      setReassigning(orderId);
      try {
        await fetch('/api/dispatch/reassign', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ order_id: orderId, courier_user_id: courierUserId }),
        });
        onRefresh();
      } finally {
        setReassigning(null);
      }
    },
    [onRefresh],
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">Comenzi azi ({orders.length})</h2>
        <div className="flex gap-1 text-xs">
          {([
            ['all', 'Toate'],
            ['unassigned', 'Neasignate'],
            ['in_flight', 'În curs'],
            ['stale', '>5min'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded px-2 py-1 ${
                filter === key
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-zinc-100">
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-zinc-500">
            Nici o comandă în acest filtru.
          </li>
        )}
        {filtered.slice(0, 50).map((o) => (
          <li key={o.id} className="px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
                    {o.id.slice(0, 8)}
                  </span>
                  <span className="text-xs font-medium text-zinc-700">{o.status}</span>
                  <span className="text-xs text-zinc-400">· {relTime(o.created_at)}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-zinc-500">
                  {o.customer_address ?? '—'}
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  Curier:{' '}
                  {o.assigned_courier_user_id
                    ? nameByUserId.get(o.assigned_courier_user_id) ?? '—'
                    : '— neasignat —'}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <select
                  defaultValue=""
                  disabled={reassigning === o.id}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) reassign(o.id, v);
                    e.target.value = '';
                  }}
                >
                  <option value="">Reasignează…</option>
                  {profiles.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.full_name ?? p.user_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
