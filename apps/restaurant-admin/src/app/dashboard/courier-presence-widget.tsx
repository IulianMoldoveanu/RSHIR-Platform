// Wave 1.3 + audit P0 #11 — per-fleet presence subscriber for the tenant
// dashboard. Server component: resolves the tenant's assigned fleets via
// `fleet_restaurant_assignments`, then hands the fleet id list to a thin
// client component that opens one Realtime channel per fleet.
//
// Why the split: the previous implementation subscribed to a single
// global `couriers:presence` channel and counted every courier on the
// platform — that was a cross-fleet competitive leak. By scoping to the
// tenant's own fleets we get the same UX with zero cross-tenant visibility.

import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { CourierPresenceWidgetClient } from './courier-presence-widget-client';

export async function CourierPresenceWidget() {
  let fleetIds: string[] = [];
  try {
    const { tenant, isPlatformAdminMode } = await getActiveTenant();
    if (isPlatformAdminMode) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data } = await admin
      .from('fleet_restaurant_assignments')
      .select('fleet_id')
      .eq('restaurant_tenant_id', tenant.id)
      .eq('status', 'active');

    fleetIds = Array.from(
      new Set(
        ((data ?? []) as { fleet_id: string | null }[])
          .map((r) => r.fleet_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
  } catch {
    // Soft-fail: widget is decorative; render nothing if we can't resolve
    // the tenant or fleet list.
    return null;
  }

  if (fleetIds.length === 0) return null;
  return <CourierPresenceWidgetClient fleetIds={fleetIds} />;
}
