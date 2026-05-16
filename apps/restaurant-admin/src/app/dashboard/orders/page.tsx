import Link from 'next/link';
import { Receipt } from 'lucide-react';
import { EmptyState } from '@hir/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { friendlyDbError } from '@/lib/db-error';
import { ticketAgingClass } from '@/lib/uiux-quickwins';
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

// Cross-cutting palette consolidation (audit §Color): drop from 7 hue
// families to 4. amber=PENDING (needs attention), purple=in-progress,
// emerald=DELIVERED (success), rose=CANCELLED.
const STATUS_PILL: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800 ring-amber-200',
  CONFIRMED: 'bg-purple-100 text-purple-800 ring-purple-200',
  PREPARING: 'bg-purple-100 text-purple-800 ring-purple-200',
  READY: 'bg-purple-100 text-purple-800 ring-purple-200',
  DISPATCHED: 'bg-purple-100 text-purple-800 ring-purple-200',
  IN_DELIVERY: 'bg-purple-100 text-purple-800 ring-purple-200',
  DELIVERED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  CANCELLED: 'bg-rose-100 text-rose-800 ring-rose-200',
};

type Filter = 'active' | 'today' | 'all' | 'cash';

// DB-shaped union: includes legacy aggregator values (TAZZ + FOODPANDA)
// because the Postgres enum still carries them — we cannot drop enum values
// safely while legacy orders exist. UI rendering narrows legacy values to
// a generic "Sursă externă" pill via resolveSourceDisplay() below.
type OrderSource =
  | 'INTERNAL_STOREFRONT'
  | 'EXTERNAL_API'
  | 'POS_PUSH'
  | 'MANUAL_ADMIN'
  | 'GLOVO'
  | 'WOLT'
  | 'TAZZ'
  | 'FOODPANDA'
  | 'BOLT_FOOD';

// Legacy aggregators removed from active integrations 2026-05-06.
// Tazz merged into Wolt RO (May 2025); foodpanda exited RO (2021).
// Values kept for legacy data compatibility only — renderer maps them to
// a neutral "Sursă externă" pill so historical orders still display.
const LEGACY_AGGREGATOR_SOURCES = ['TAZZ', 'FOODPANDA'] as const;
type LegacyAggregatorSource = (typeof LEGACY_AGGREGATOR_SOURCES)[number];

function isLegacyAggregator(s: string): s is LegacyAggregatorSource {
  return (LEGACY_AGGREGATOR_SOURCES as readonly string[]).includes(s);
}

type OrderRow = {
  id: string;
  status: OrderStatus;
  source: OrderSource | null;
  payment_method: 'CARD' | 'COD' | null;
  total_ron: number;
  created_at: string;
  delivery_address_id: string | null;
  items: unknown;
  customers: { first_name: string | null; last_name: string | null } | null;
};

// Visible badge for non-storefront orders. INTERNAL_STOREFRONT renders no
// badge at all (the default — no need to call out "this came from the
// regular storefront"). Per-aggregator brand colors keep the operator's
// scan time low when the orders feed mixes Glovo + Wolt + storefront on
// the same day. Phase 1 only — until Phase 2 wires per-platform webhooks
// the aggregator values are reachable only via direct DB writes.
type ActiveOrderSource = Exclude<
  OrderSource,
  'INTERNAL_STOREFRONT' | LegacyAggregatorSource
>;

const SOURCE_LABEL: Record<ActiveOrderSource, string> = {
  EXTERNAL_API: 'API',
  POS_PUSH: 'POS',
  MANUAL_ADMIN: 'Manual',
  GLOVO: 'Glovo',
  WOLT: 'Wolt',
  BOLT_FOOD: 'Bolt Food',
};

const SOURCE_BADGE_CLASS: Record<ActiveOrderSource, string> = {
  // Generic / internal-ish sources keep the original neutral sky chip.
  EXTERNAL_API: 'bg-sky-50 text-sky-800 ring-sky-200',
  POS_PUSH: 'bg-sky-50 text-sky-800 ring-sky-200',
  MANUAL_ADMIN: 'bg-sky-50 text-sky-800 ring-sky-200',
  // Aggregator brand-tinted chips. Tailwind palette only (no random hex)
  // and ring-1 ring-inset already applied at the wrapping span.
  GLOVO: 'bg-yellow-50 text-yellow-900 ring-yellow-300',
  WOLT: 'bg-cyan-50 text-cyan-900 ring-cyan-300',
  BOLT_FOOD: 'bg-emerald-50 text-emerald-900 ring-emerald-300',
};

// Single-source-of-truth renderer — handles legacy aggregator values
// defensively without crashing when DB returns TAZZ / FOODPANDA on a
// historical order.
function resolveSourceDisplay(
  source: Exclude<OrderSource, 'INTERNAL_STOREFRONT'>,
): { label: string; badgeClass: string } {
  if (isLegacyAggregator(source)) {
    return {
      label: 'Sursă externă',
      badgeClass: 'bg-zinc-100 text-zinc-800 ring-zinc-300',
    };
  }
  return {
    label: SOURCE_LABEL[source],
    badgeClass: SOURCE_BADGE_CLASS[source],
  };
}

const PENDING_DANGER_MS = 5 * 60_000;

function itemCount(items: unknown): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce<number>(
    (s, it) => s + (typeof it === 'object' && it !== null && 'quantity' in it
      ? Number((it as { quantity?: number }).quantity ?? 1)
      : 1),
    0,
  );
}

function parseFilter(value: string | string[] | undefined): Filter {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === 'today' || v === 'all' || v === 'cash') return v;
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
  searchParams?: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter = parseFilter(sp?.filter);
  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();

  // Try the SELECT with payment_method (added by 20260504_001). If the
  // migration hasn't applied yet, fall back to the legacy column set so the
  // admin queue keeps working — payment_method is undefined and the Cash
  // chip just doesn't render until the column exists.
  const COLS_FULL =
    'id, status, source, payment_method, total_ron, created_at, delivery_address_id, items, customers(first_name, last_name)';
  const COLS_LEGACY =
    'id, status, source, total_ron, created_at, delivery_address_id, items, customers(first_name, last_name)';

  async function loadOrders(cols: string, includeCashFilter: boolean) {
    let q = admin
      .from('restaurant_orders')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select(cols as any)
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(50);
    // Pre-orders (is_pre_order=true) live on /dashboard/pre-orders. They
    // share the restaurant_orders table but must NOT pollute the live queue
    // or KDS — a cake scheduled for next week would otherwise sit as PENDING
    // and trick staff into starting it today. The .or() form tolerates legacy
    // rows where the column is null (pre-migration) by accepting either
    // null OR false.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    q = (q as any).or('is_pre_order.is.null,is_pre_order.eq.false');
    if (filter === 'active') {
      q = q.in('status', ACTIVE_STATUSES);
    } else if (filter === 'today') {
      q = q.gte('created_at', startOfTodayIso());
    } else if (filter === 'cash' && includeCashFilter) {
      // Outstanding COD reconciliation. Cast through unknown until
      // supabase-types regenerates with the payment_method column.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      q = (q as any).eq('payment_method', 'COD').eq('payment_status', 'UNPAID')
        .neq('status', 'CANCELLED');
    }
    return q;
  }

  let { data, error } = await loadOrders(COLS_FULL, true);
  if (error && /payment_method/i.test(error.message ?? '')) {
    // Pre-migration: drop the cash filter (column missing) but still render
    // the rest. The user clicked Cash but the data isn't there yet — better
    // to show the regular queue than a hard 500.
    ({ data, error } = await loadOrders(COLS_LEGACY, false));
  }
  if (error) throw friendlyDbError(error, 'încărcarea listei de comenzi');

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

      {/* Mobile-fix 2026-05-05: title + Export + 4 filter pills overflowed
          a 360px viewport. Allow the whole header and the right-hand
          actions to wrap so the filter pills get their own row on phones
          while keeping the row layout intact on tablet+. */}
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Comenzi</h1>
          <p className="text-sm text-zinc-600">Ultimele 50 comenzi pentru {tenant.name}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
                  {items.map((o) => {
                    const ageMs = Date.now() - new Date(o.created_at).getTime();
                    const stalePending = o.status === 'PENDING' && ageMs > PENDING_DANGER_MS;
                    const count = itemCount(o.items);
                    // Don't render the status pill while grouped (the section
                    // heading already announces the state). Show it only when
                    // the user is on "Toate" so mixed states are scannable.
                    const showPill = filter === 'all';
                    const agingClass = ticketAgingClass(
                      o.status,
                      new Date(o.created_at).getTime(),
                      Date.now(),
                    );
                    return (
                      <li key={o.id} className={`border-l-4 text-sm ${agingClass}`}>
                        <Link
                          href={`/dashboard/orders/${o.id}`}
                          className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 sm:gap-4"
                        >
                          {/* Mobile-fix 2026-05-05: allow the badge cluster
                              to wrap onto a second flex row so it doesn't
                              push the price/age column off-screen on a
                              360px phone. */}
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                            {stalePending && (
                              <span
                                aria-label="În așteptare de >5 minute"
                                className="h-2 w-2 flex-none rounded-full bg-rose-500"
                              />
                            )}
                            <span className="font-mono text-xs text-zinc-500">#{shortId(o.id)}</span>
                            <span className="min-w-0 max-w-full truncate font-medium text-zinc-900">
                              {(o.customers?.first_name ?? 'Anonim').trim()}{' '}
                              {lastInitial(o.customers?.last_name ?? null)}
                            </span>
                            {showPill && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_PILL[o.status]}`}
                              >
                                {STATUS_LABEL[o.status]}
                              </span>
                            )}
                            {o.delivery_address_id === null && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                                Ridicare
                              </span>
                            )}
                            {o.source && o.source !== 'INTERNAL_STOREFRONT' && (() => {
                              const display = resolveSourceDisplay(o.source);
                              return (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${display.badgeClass}`}
                                >
                                  {display.label}
                                </span>
                              );
                            })()}
                            {o.payment_method === 'COD' && (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
                                Cash
                              </span>
                            )}
                          </div>
                          <div className="flex flex-none items-center gap-3 text-zinc-600 sm:gap-4">
                            {count > 0 && (
                              <span className="hidden text-xs text-zinc-500 sm:inline">
                                {count} {count === 1 ? 'produs' : 'produse'}
                              </span>
                            )}
                            <span className="font-mono tabular-nums">
                              {formatRon(Number(o.total_ron))}
                            </span>
                            <span
                              className={`w-10 text-right text-xs tabular-nums sm:w-12 ${
                                stalePending ? 'font-semibold text-rose-600' : 'text-zinc-400'
                              }`}
                            >
                              {timeAgo(o.created_at)}
                            </span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
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
    { value: 'cash', label: 'Cash neîncasat' },
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
