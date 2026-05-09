import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import type { OrderStatus } from '../dashboard/orders/status-machine';
import { KdsClient, type KdsOrder } from './kds-client';

export const dynamic = 'force-dynamic';

const KDS_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'DISPATCHED',
];

export default async function KdsPage() {
  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();

  // Pre-orders (is_pre_order=true) are scheduled for future dates and must
  // NOT appear on the live KDS today — they live on /dashboard/pre-orders.
  // The .or() form tolerates legacy rows where the column is null
  // (pre-migration) by accepting either null OR false.
  const { data, error } = await (admin
    .from('restaurant_orders')
    .select('id, status, source, items, notes, delivery_address_id, created_at, updated_at')
    .eq('tenant_id', tenant.id)
    .in('status', KDS_STATUSES)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .or('is_pre_order.is.null,is_pre_order.eq.false') as any)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);

  const orders = (data ?? []) as unknown as KdsOrder[];

  return (
    <KdsClient
      tenantId={tenant.id}
      tenantName={tenant.name}
      initialOrders={orders}
    />
  );
}
