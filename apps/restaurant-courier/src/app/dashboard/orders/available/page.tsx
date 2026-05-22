import { MapPinned } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { EmptyState } from '@/components/empty-state';
import { resolveRiderMode } from '@/lib/rider-mode';
import { OrdersRealtime } from '../orders-realtime';
import { PoolList } from './_components/pool-list';

export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  status: string;
  vertical: 'restaurant' | 'pharma';
  customer_first_name: string | null;
  pickup_line1: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_line1: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  total_ron: number | null;
  delivery_fee_ron: number | null;
  created_at: string;
  source_tenant_id: string | null;
  fleet_id: string | null;
};

const ORDER_COLUMNS =
  'id, status, vertical, customer_first_name, pickup_line1, pickup_lat, pickup_lng, dropoff_line1, dropoff_lat, dropoff_lng, total_ron, delivery_fee_ron, created_at, source_tenant_id, fleet_id';

export default async function AvailablePoolPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const [{ data: openData }, riderMode, { data: profileData }, { data: activeCountData }] =
    await Promise.all([
      admin
        .from('courier_orders')
        .select(ORDER_COLUMNS)
        .is('assigned_courier_user_id', null)
        .in('status', ['CREATED', 'OFFERED'])
        .order('created_at', { ascending: true })
        .limit(40),
      resolveRiderMode(user.id),
      admin
        .from('courier_profiles')
        .select('fleet_id, max_parallel_orders')
        .eq('user_id', user.id)
        .maybeSingle(),
      admin
        .from('courier_orders')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_courier_user_id', user.id)
        .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']),
    ]);

  // Mode C riders are dispatched by their fleet manager — they don't
  // browse open orders; surfacing the pool is a useless affordance.
  if (riderMode.mode === 'C') {
    return (
      <div className="mx-auto max-w-xl">
        <EmptyState
          icon={<MapPinned className="h-5 w-5" aria-hidden />}
          title="Pool indisponibil"
          hint="Comenzile îți sunt asignate de managerul de flotă."
          ctaHref="/dashboard/orders"
          ctaLabel="Vezi comenzile mele"
        />
      </div>
    );
  }

  const profile = (profileData as {
    fleet_id: string | null;
    max_parallel_orders: number | null;
  } | null) ?? { fleet_id: null, max_parallel_orders: null };

  const open = (openData ?? []) as OrderRow[];
  const activeCount = (activeCountData as unknown as { count?: number } | null)?.count ?? 0;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <OrdersRealtime
        courierUserId={user.id}
        fleetId={profile.fleet_id}
        watchFleetOpenOrders={true}
      />

      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-hir-fg">Comenzi disponibile</h1>
        <p className="text-xs text-hir-muted-fg">
          Self-pickup live. Ia comanda direct, fără să aștepți dispecer.
        </p>
      </header>

      <PoolList
        orders={open}
        currentActiveCount={activeCount}
        maxParallel={profile.max_parallel_orders}
      />
    </div>
  );
}
