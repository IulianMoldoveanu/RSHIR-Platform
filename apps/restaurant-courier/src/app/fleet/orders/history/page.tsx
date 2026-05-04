import Link from 'next/link';
import { Banknote, ChevronLeft, Inbox } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';

export const dynamic = 'force-dynamic';

type HistoryRow = {
  id: string;
  status: string;
  customer_first_name: string | null;
  pickup_line1: string | null;
  dropoff_line1: string | null;
  total_ron: number | null;
  delivery_fee_ron: number | null;
  payment_method: 'CARD' | 'COD' | null;
  assigned_courier_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type CourierRow = { user_id: string; full_name: string | null };

const STATUS_TONE: Record<string, string> = {
  DELIVERED: 'bg-emerald-500/10 text-emerald-300',
  CANCELLED: 'bg-zinc-800 text-zinc-400',
};

const STATUS_LABEL: Record<string, string> = {
  DELIVERED: 'Livrată',
  CANCELLED: 'Anulată',
};

const RANGE_OPTIONS = [
  { days: 1, label: '24 ore' },
  { days: 7, label: '7 zile' },
  { days: 30, label: '30 zile' },
  { days: 90, label: '90 zile' },
] as const;

// "24 ore" should mean "the last 24 hours from now," not "from local
// midnight" — Codex P2 #178 caught that startOfDay(0) excluded orders
// updated yesterday evening once the clock crossed midnight. For
// multi-day ranges we keep day-aligned boundaries (so a "7 zile" lookup
// is reproducible across page loads regardless of when in the day the
// manager opens it).
function rangeStart(days: number): Date {
  if (days <= 1) {
    return new Date(Date.now() - 24 * 60 * 60 * 1000);
  }
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function FleetOrdersHistoryPage({
  searchParams,
}: {
  searchParams: { days?: string; courier?: string };
}) {
  const fleet = await requireFleetManager();
  const admin = createAdminClient();

  const requested = Number(searchParams.days ?? '7');
  const days = RANGE_OPTIONS.some((o) => o.days === requested) ? requested : 7;
  const since = rangeStart(days);
  const courierFilter = searchParams.courier?.trim() || null;

  // Build the order list + summary queries; both share the optional
  // courier filter so the totals stay consistent with the displayed
  // rows when the filter is set.
  const baseOrders = admin
    .from('courier_orders')
    .select(
      'id, status, customer_first_name, pickup_line1, dropoff_line1, total_ron, delivery_fee_ron, payment_method, assigned_courier_user_id, created_at, updated_at',
    )
    .eq('fleet_id', fleet.fleetId)
    .in('status', ['DELIVERED', 'CANCELLED'])
    .gte('updated_at', since.toISOString());
  const ordersReq = courierFilter
    ? baseOrders
        .eq('assigned_courier_user_id', courierFilter)
        .order('updated_at', { ascending: false })
        .limit(200)
    : baseOrders.order('updated_at', { ascending: false }).limit(200);

  // Separate aggregate query for the period totals — Codex P2 #178
  // caught that deriving counts/revenue from the 200-row truncated list
  // under-reports for fleets with high volume. Tiny payload (only fee +
  // status), so even a 90-day window stays cheap.
  const baseSummary = admin
    .from('courier_orders')
    .select('status, delivery_fee_ron')
    .eq('fleet_id', fleet.fleetId)
    .in('status', ['DELIVERED', 'CANCELLED'])
    .gte('updated_at', since.toISOString());
  const summaryReq = courierFilter
    ? baseSummary.eq('assigned_courier_user_id', courierFilter)
    : baseSummary;

  const [{ data: ordersData }, { data: couriersData }, { data: summaryData }] = await Promise.all([
    ordersReq,
    admin
      .from('courier_profiles')
      .select('user_id, full_name')
      .eq('fleet_id', fleet.fleetId)
      .order('full_name', { ascending: true }),
    summaryReq,
  ]);

  const orders = (ordersData ?? []) as HistoryRow[];
  const couriers = (couriersData ?? []) as CourierRow[];
  const summary = (summaryData ?? []) as Array<{
    status: string;
    delivery_fee_ron: number | null;
  }>;
  const courierName = new Map(couriers.map((c) => [c.user_id, c.full_name ?? '—']));

  // Period totals from the un-truncated summary query — orders[] is
  // capped at 200 for display purposes but the header reflects the full
  // count/revenue for the range.
  const totalCount = summary.length;
  const deliveredCount = summary.filter((s) => s.status === 'DELIVERED').length;
  const totalRevenue = summary
    .filter((s) => s.status === 'DELIVERED')
    .reduce((sum, s) => sum + (Number(s.delivery_fee_ron) || 0), 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link
        href="/fleet/orders"
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Înapoi la dispecerat
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
          Istoric comenzi
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {courierFilter
            ? `${courierName.get(courierFilter) ?? 'Curier'} · `
            : ''}
          {totalCount} {totalCount === 1 ? 'comandă' : 'comenzi'} ·{' '}
          {deliveredCount} livrate · {totalRevenue.toFixed(2)} RON
        </p>
      </div>

      {/* Range picker — server-rendered links, not client state, so refresh
          + share URL behave correctly. The courier filter (if set) is
          preserved across range switches. */}
      <div className="flex flex-wrap gap-2">
        {RANGE_OPTIONS.map((opt) => {
          const active = opt.days === days;
          const params = new URLSearchParams({ days: String(opt.days) });
          if (courierFilter) params.set('courier', courierFilter);
          return (
            <Link
              key={opt.days}
              href={`/fleet/orders/history?${params.toString()}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active
                  ? 'border-violet-500 bg-violet-500/10 text-violet-200'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
        <Link
          href={`/fleet/earnings/export?days=${days}`}
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
        >
          Export CSV
        </Link>
      </div>

      {/* Courier filter — native form GET keeps the URL shareable and the
          range param sticky across submissions. Selecting "Toți" clears
          the filter via an empty value. */}
      <form
        method="get"
        action="/fleet/orders/history"
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="days" value={String(days)} />
        <label htmlFor="courier-filter" className="text-xs text-zinc-500">
          Filtrează după curier:
        </label>
        <select
          id="courier-filter"
          name="courier"
          defaultValue={courierFilter ?? ''}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 focus:border-violet-500 focus:outline-none"
        >
          <option value="">Toți curierii</option>
          {couriers.map((c) => (
            <option key={c.user_id} value={c.user_id}>
              {c.full_name ?? c.user_id.slice(0, 8)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
        >
          Aplică
        </button>
        {courierFilter ? (
          <Link
            href={`/fleet/orders/history?days=${days}`}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Resetează
          </Link>
        ) : null}
      </form>

      {orders.length === 0 ? (
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900 px-4 py-10 text-center text-sm text-zinc-500">
          <Inbox className="h-5 w-5" aria-hidden />
          Nicio comandă livrată sau anulată în această perioadă.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => (
            <HistoryItem
              key={o.id}
              order={o}
              courierName={
                o.assigned_courier_user_id
                  ? (courierName.get(o.assigned_courier_user_id) ?? null)
                  : null
              }
            />
          ))}
        </ul>
      )}

      {orders.length === 200 ? (
        <p className="text-center text-[11px] text-zinc-500">
          Afișate primele 200 de înregistrări. Restrânge intervalul sau folosește
          export CSV pentru o listă completă.
        </p>
      ) : null}
    </div>
  );
}

function HistoryItem({
  order,
  courierName,
}: {
  order: HistoryRow;
  courierName: string | null;
}) {
  return (
    <li>
      <Link
        href={`/fleet/orders/${order.id}`}
        className="block rounded-xl border border-zinc-800 bg-zinc-950 p-3 hover:border-violet-500/40 hover:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TONE[order.status] ?? 'bg-zinc-800 text-zinc-300'}`}
              >
                {STATUS_LABEL[order.status] ?? order.status}
              </span>
              <p className="truncate text-sm font-medium text-zinc-100">
                {order.customer_first_name ?? 'Client'}
              </p>
              {order.payment_method === 'COD' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                  <Banknote className="h-3 w-3" aria-hidden />
                  Cash
                </span>
              ) : null}
            </div>
            <p className="mt-1 truncate text-xs text-zinc-500">
              {order.pickup_line1 ?? '—'} → {order.dropoff_line1 ?? '—'}
            </p>
            <p className="mt-1 text-[11px] text-zinc-400">
              {courierName ? (
                <>
                  Curier: <span className="text-zinc-200">{courierName}</span>
                </>
              ) : (
                <span className="text-zinc-500">Fără curier asignat</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-[10px] text-zinc-500">
            <span>
              {new Date(order.updated_at).toLocaleString('ro-RO', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {order.delivery_fee_ron != null && order.status === 'DELIVERED' ? (
              <span className="font-semibold text-emerald-300">
                {Number(order.delivery_fee_ron).toFixed(2)} RON
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}
