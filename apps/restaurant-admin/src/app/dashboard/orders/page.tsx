import Link from 'next/link';
import { Receipt } from 'lucide-react';
import { EmptyState } from '@hir/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { OrdersRealtime } from './orders-realtime';
import type { OrderStatus } from './status-machine';

export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'DISPATCHED',
  'IN_DELIVERY',
];

const STATUS_GROUPS: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'DISPATCHED',
  'IN_DELIVERY',
  'DELIVERED',
  'CANCELLED',
];

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'In asteptare',
  CONFIRMED: 'Confirmate',
  PREPARING: 'In preparare',
  READY: 'Gata',
  DISPATCHED: 'Trimise',
  IN_DELIVERY: 'In livrare',
  DELIVERED: 'Livrate',
  CANCELLED: 'Anulate',
};

const STATUS_PILL: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800 ring-amber-200',
  CONFIRMED: 'bg-blue-100 text-blue-800 ring-blue-200',
  PREPARING: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  READY: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  DISPATCHED: 'bg-violet-100 text-violet-800 ring-violet-200',
  IN_DELIVERY: 'bg-purple-100 text-purple-800 ring-purple-200',
  DELIVERED: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  CANCELLED: 'bg-rose-100 text-rose-800 ring-rose-200',
};

type Filter = 'active' | 'today' | 'all';

type OrderRow = {
  id: string;
  status: OrderStatus;
  total_ron: number;
  created_at: string;
  delivery_address_id: string | null;
  customers: { first_name: string | null; last_name: string | null } | null;
};

function parseFilter(value: string | string[] | undefined): Filter {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === 'today' || v === 'all') return v;
  return 'active';
}

function formatRon(n: number): string {
  return `${Number(n).toFixed(2)} RON`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function lastInitial(s: string | null): string {
  if (!s) return '';
  const c = s.trim().charAt(0);
  return c ? `${c.toUpperCase()}.` : '';
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: { filter?: string };
}) {
  const filter = parseFilter(searchParams?.filter);
  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();

  let q = admin
    .from('restaurant_orders')
    .select('id, status, total_ron, created_at, delivery_address_id, customers(first_name, last_name)')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (filter === 'active') {
    q = q.in('status', ACTIVE_STATUSES);
  } else if (filter === 'today') {
    q = q.gte('created_at', startOfTodayIso());
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as OrderRow[];

  const grouped = new Map<OrderStatus, OrderRow[]>();
  for (const r of rows) {
    const arr = grouped.get(r.status) ?? [];
    arr.push(r);
    grouped.set(r.status, arr);
  }

  const groupsToRender = STATUS_GROUPS.filter((s) => (grouped.get(s)?.length ?? 0) > 0);

  return (
    <div className="flex flex-col gap-6">
      <OrdersRealtime tenantId={tenant.id} />

      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Comenzi</h1>
          <p className="text-sm text-zinc-600">Ultimele 50 comenzi pentru {tenant.name}.</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/api/dashboard/orders/export"
            className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            title="Descarcă ultimele 90 zile ca CSV"
          >
            Export CSV
          </a>
          <FilterPills active={filter} />
        </div>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-10 w-10" />}
          title="Nicio comandă pentru filtrul curent."
          description="Comenzile noi apar aici imediat ce un client plasează prima comandă."
          hint='Filtrul curent: schimbă-l în "Toate" pentru a vedea istoricul complet.'
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groupsToRender.map((status) => {
            const items = grouped.get(status) ?? [];
            return (
              <section key={status} className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-zinc-700">
                  {STATUS_LABEL[status]}{' '}
                  <span className="text-zinc-400">({items.length})</span>
                </h2>
                <ul className="flex flex-col divide-y divide-zinc-100 rounded-md border border-zinc-200 bg-white">
                  {items.map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-zinc-500">#{shortId(o.id)}</span>
                        <span className="font-medium text-zinc-900">
                          {(o.customers?.first_name ?? 'Anonim').trim()}{' '}
                          {lastInitial(o.customers?.last_name ?? null)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_PILL[o.status]}`}
                        >
                          {STATUS_LABEL[o.status]}
                        </span>
                        {o.delivery_address_id === null && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                            Ridicare
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-zinc-600">
                        <span>{formatRon(Number(o.total_ron))}</span>
                        <span className="w-10 text-right text-xs text-zinc-400">
                          {timeAgo(o.created_at)}
                        </span>
                        <Link
                          href={`/dashboard/orders/${o.id}`}
                          className="rounded-md border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                        >
                          Deschide
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterPills({ active }: { active: Filter }) {
  const pills: Array<{ value: Filter; label: string }> = [
    { value: 'active', label: 'Active' },
    { value: 'today', label: 'Azi' },
    { value: 'all', label: 'Toate' },
  ];
  return (
    <nav className="flex items-center gap-1 rounded-md bg-zinc-100 p-1 text-xs">
      {pills.map((p) => {
        const isActive = p.value === active;
        return (
          <Link
            key={p.value}
            href={p.value === 'active' ? '/dashboard/orders' : `/dashboard/orders?filter=${p.value}`}
            className={
              'rounded px-3 py-1.5 font-medium transition-colors ' +
              (isActive ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900')
            }
          >
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
