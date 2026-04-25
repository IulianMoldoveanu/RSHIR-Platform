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

  const { data, error } = await admin
    .from('restaurant_orders')
    .select('id, status, items, notes, delivery_address_id, created_at, updated_at')
    .eq('tenant_id', tenant.id)
    .in('status', KDS_STATUSES)
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
