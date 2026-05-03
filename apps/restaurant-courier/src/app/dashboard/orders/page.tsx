import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { VerticalBadge } from '@/components/vertical-badge';
import { refreshOrdersAction } from '../actions';
import { OrdersRealtime } from './orders-realtime';
import { resolveRiderMode } from '@/lib/rider-mode';

export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  status: string;
  vertical: 'restaurant' | 'pharma';
  customer_first_name: string | null;
  pickup_line1: string | null;
  dropoff_line1: string | null;
  total_ron: number | null;
  delivery_fee_ron: number | null;
  created_at: string;
};

const ACTIVE_STATUSES = ['CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'];

export default async function OrdersPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const [{ data: assignedData }, { data: openData }, riderMode] = await Promise.all([
    admin
      .from('courier_orders')
      .select('id, status, vertical, customer_first_name, pickup_line1, dropoff_line1, total_ron, delivery_fee_ron, created_at')
      .eq('assigned_courier_user_id', user.id)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false }),
    admin
      .from('courier_orders')
      .select('id, status, vertical, customer_first_name, pickup_line1, dropoff_line1, total_ron, delivery_fee_ron, created_at')
      .is('assigned_courier_user_id', null)
      .in('status', ['CREATED', 'OFFERED'])
      .order('created_at', { ascending: false })
      .limit(20),
    resolveRiderMode(user.id),
  ]);

  const assigned = (assignedData ?? []) as OrderRow[];
  const open = (openData ?? []) as OrderRow[];

  // Mode C riders are dispatched by their fleet manager — they don't
  // browse open orders. Hiding the section both removes a useless UI
  // affordance and matches the FM-authority model (rider acknowledges,
  // never picks).
  const showOpenOrders = riderMode.mode !== 'C';

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <OrdersRealtime courierUserId={user.id} />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-100">Comenzi</h1>
        <form action={refreshOrdersAction}>
          <button
            type="submit"
            aria-label="Reîmprospătează"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Actualizează
          </button>
        </form>
      </div>

      <Section title="Comenzile mele" count={assigned.length}>
        {assigned.length === 0 ? (
          <Empty>Nicio comandă activă.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {assigned.map((o) => (
              <OrderListItem key={o.id} order={o} />
            ))}
          </ul>
        )}
      </Section>

      {showOpenOrders ? (
        <Section title="Comenzi disponibile" count={open.length}>
          {open.length === 0 ? (
            <Empty>Nicio comandă disponibilă acum.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {open.map((o) => (
                <OrderListItem key={o.id} order={o} />
              ))}
            </ul>
          )}
        </Section>
      ) : null}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title} ({count})
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-8 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}

function OrderListItem({ order }: { order: OrderRow }) {
  return (
    <li>
      <Link
        href={`/dashboard/orders/${order.id}`}
        className="block rounded-xl border border-zinc-800 bg-zinc-900 p-3 hover:border-violet-500/50 hover:bg-zinc-900/70"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-zinc-100">
                {order.customer_first_name ?? 'Client'}
                {order.delivery_fee_ron != null ? (
                  <span className="ml-2 text-xs font-normal text-violet-300">
                    +{Number(order.delivery_fee_ron).toFixed(2)} RON
                  </span>
                ) : null}
              </p>
              <VerticalBadge vertical={order.vertical ?? 'restaurant'} />
            </div>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {order.pickup_line1 ?? '—'} → {order.dropoff_line1 ?? '—'}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
            {order.status}
          </span>
        </div>
      </Link>
    </li>
  );
}
