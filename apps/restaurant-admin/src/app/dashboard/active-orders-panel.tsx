import Link from 'next/link';
import { Receipt } from 'lucide-react';
import { EmptyState } from '@hir/ui';
import { createAdminClient } from '@/lib/supabase/admin';

const ACTIVE_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'DISPATCHED',
  'IN_DELIVERY',
] as const;

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'În așteptare',
  CONFIRMED: 'Confirmată',
  PREPARING: 'În pregătire',
  READY: 'Gata',
  DISPATCHED: 'La curier',
  IN_DELIVERY: 'În livrare',
};

function fmtAge(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ${min % 60}m`;
}

export async function ActiveOrdersPanel({ tenantId }: { tenantId: string }) {
  const admin = createAdminClient();
  // Exclude pre-orders (is_pre_order=true) — they belong on /dashboard/pre-orders
  // and should not surface in the homepage active-orders quick-glance.
  const { data } = await (admin
    .from('restaurant_orders')
    .select('id, status, total_ron, created_at, customers(first_name)')
    .eq('tenant_id', tenantId)
    .in('status', ACTIVE_STATUSES as unknown as string[])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .or('is_pre_order.is.null,is_pre_order.eq.false') as any)
    .order('created_at', { ascending: false })
    .limit(5);

  const rows = (data ?? []) as Array<{
    id: string;
    status: string;
    total_ron: number | string | null;
    created_at: string;
    customers: { first_name: string | null } | null;
  }>;

  return (
    <section aria-label="Comenzi active">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-700">Comenzi active</h2>
        <Link
          href="/dashboard/orders"
          className="text-xs font-medium text-purple-700 hover:text-purple-900"
        >
          Vezi toate →
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-10 w-10" />}
          title="Nicio comandă activă în acest moment."
          description="Comenzile noi vor apărea aici instant și se vor actualiza singure."
        />
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
          {rows.map((o) => {
            const customerName = o.customers?.first_name ?? 'Client';
            const isPending = o.status === 'PENDING';
            const ageMs = Date.now() - new Date(o.created_at).getTime();
            const stalePending = isPending && ageMs > 5 * 60_000;
            return (
              <li key={o.id}>
                <Link
                  href={`/dashboard/orders/${o.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-zinc-50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {stalePending && (
                      <span
                        aria-label="În așteptare de >5 minute"
                        className="h-2 w-2 flex-none rounded-full bg-rose-500"
                      />
                    )}
                    <span className="font-mono text-xs text-zinc-500">
                      #{o.id.slice(0, 8)}
                    </span>
                    <span className="truncate font-medium text-zinc-800">{customerName}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span className="hidden sm:inline">{STATUS_LABEL[o.status] ?? o.status}</span>
                    <span
                      className={`tabular-nums ${stalePending ? 'font-semibold text-rose-600' : ''}`}
                    >
                      {fmtAge(o.created_at)}
                    </span>
                    <span className="font-mono tabular-nums text-zinc-700">
                      {Number(o.total_ron ?? 0).toFixed(2)} RON
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
