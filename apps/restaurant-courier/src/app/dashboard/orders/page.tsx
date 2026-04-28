import Link from 'next/link';
import { Card, CardContent } from '@hir/ui';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  status: string;
  customer_first_name: string | null;
  pickup_line1: string | null;
  dropoff_line1: string | null;
  total_ron: number | null;
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

  // Active orders: either assigned to this courier, or unassigned and offered.
  const { data: assignedData } = await admin
    .from('courier_orders')
    .select('id, status, customer_first_name, pickup_line1, dropoff_line1, total_ron, created_at')
    .eq('assigned_courier_user_id', user.id)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false });

  const { data: openData } = await admin
    .from('courier_orders')
    .select('id, status, customer_first_name, pickup_line1, dropoff_line1, total_ron, created_at')
    .is('assigned_courier_user_id', null)
    .in('status', ['CREATED', 'OFFERED'])
    .order('created_at', { ascending: false })
    .limit(20);

  const assigned = (assignedData ?? []) as OrderRow[];
  const open = (openData ?? []) as OrderRow[];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Comenzile mele ({assigned.length})
        </h2>
        {assigned.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-zinc-500">
              Nicio comandă activă.
            </CardContent>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {assigned.map((o) => (
              <OrderListItem key={o.id} order={o} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Comenzi disponibile ({open.length})
        </h2>
        {open.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-zinc-500">
              Nicio comandă disponibilă acum.
            </CardContent>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((o) => (
              <OrderListItem key={o.id} order={o} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OrderListItem({ order }: { order: OrderRow }) {
  return (
    <li>
      <Link href={`/dashboard/orders/${order.id}`} className="block">
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900">
                {order.customer_first_name ?? 'Client'} —{' '}
                {order.total_ron != null ? `${Number(order.total_ron).toFixed(2)} RON` : ''}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {order.pickup_line1} → {order.dropoff_line1}
              </p>
            </div>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700">
              {order.status}
            </span>
          </CardContent>
        </Card>
      </Link>
    </li>
  );
}
