// Server-side snapshot for the fleet manager dispatch dashboard on /fleet.
// One pass that pulls everything the landing widgets need:
//   - active orders for this fleet (CREATED/OFFERED/ACCEPTED/PICKED_UP/IN_TRANSIT)
//   - couriers attached to this fleet with current shift status + last lat/lng
//   - this-week payout total (RON) summed across all fleet couriers
//   - last 3 delivered orders for "recent activity" feel
//
// Server component reads via service-role admin client (bypasses RLS) and
// returns a typed object the page renders into widgets. No realtime — the
// page refreshes via a client-side timer + manual Refresh button so the data
// stays fresh enough for "at a glance" use without WebSocket complexity.

import { createAdminClient } from '@/lib/supabase/admin';

export type ActiveOrder = {
  id: string;
  status: string;
  customer_first_name: string | null;
  pickup_line1: string | null;
  dropoff_line1: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  delivery_fee_ron: number | null;
  assigned_courier_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FleetCourier = {
  user_id: string;
  full_name: string | null;
  vehicle_type: string | null;
  shift_status: 'ONLINE' | 'OFFLINE' | null;
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: string | null;
};

export type DispatchSnapshot = {
  activeOrders: ActiveOrder[];
  couriers: FleetCourier[];
  onlineCount: number;
  unassignedCount: number;
  deliveredTodayCount: number;
  deliveredThisWeekCount: number;
  payoutWeekRon: number;
  recentDelivered: Array<{
    id: string;
    customer_first_name: string | null;
    delivered_at: string | null;
    delivery_fee_ron: number | null;
  }>;
};

const ACTIVE_STATUSES = ['CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'];

export async function loadDispatchSnapshot(fleetId: string): Promise<DispatchSnapshot> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  // Bucharest week starts Monday — round down to Mon 00:00 local-ish.
  const weekStart = new Date(startOfDay);
  const dayOfWeek = (weekStart.getDay() + 6) % 7; // Mon=0..Sun=6
  weekStart.setDate(weekStart.getDate() - dayOfWeek);
  const weekStartIso = weekStart.toISOString();
  const todayStartIso = startOfDay.toISOString();

  const [
    { data: couriersData },
    { data: ordersData },
    { count: deliveredTodayCount },
    { count: deliveredWeekCount },
    { data: recentDelivered },
  ] = await Promise.all([
    admin
      .from('courier_profiles')
      .select('user_id, full_name, vehicle_type')
      .eq('fleet_id', fleetId)
      .limit(200),
    admin
      .from('courier_orders')
      .select(
        'id, status, customer_first_name, pickup_line1, dropoff_line1, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, delivery_fee_ron, assigned_courier_user_id, created_at, updated_at',
      )
      .eq('fleet_id', fleetId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(50),
    admin
      .from('courier_orders')
      .select('id', { count: 'exact', head: true })
      .eq('fleet_id', fleetId)
      .eq('status', 'DELIVERED')
      .gte('delivered_at', todayStartIso),
    admin
      .from('courier_orders')
      .select('id', { count: 'exact', head: true })
      .eq('fleet_id', fleetId)
      .eq('status', 'DELIVERED')
      .gte('delivered_at', weekStartIso),
    admin
      .from('courier_orders')
      .select('id, customer_first_name, delivered_at, delivery_fee_ron')
      .eq('fleet_id', fleetId)
      .eq('status', 'DELIVERED')
      .order('delivered_at', { ascending: false })
      .limit(3),
  ]);

  const couriers = (couriersData ?? []) as Array<{
    user_id: string;
    full_name: string | null;
    vehicle_type: string | null;
  }>;
  const courierIds = couriers.map((c) => c.user_id);

  // Latest shift per courier (most recent started_at). Pulls ONLINE first so
  // the map snapshot shows live positions; falls back to last OFFLINE shift
  // for "last known location" lozenges.
  let shiftMap = new Map<
    string,
    { status: 'ONLINE' | 'OFFLINE'; last_lat: number | null; last_lng: number | null; last_seen_at: string | null }
  >();
  if (courierIds.length > 0) {
    const { data: shiftsData } = await admin
      .from('courier_shifts')
      .select('courier_user_id, status, last_lat, last_lng, last_seen_at, started_at')
      .in('courier_user_id', courierIds)
      .order('started_at', { ascending: false })
      .limit(Math.max(200, courierIds.length * 3));
    for (const s of (shiftsData ?? []) as Array<{
      courier_user_id: string;
      status: 'ONLINE' | 'OFFLINE';
      last_lat: number | null;
      last_lng: number | null;
      last_seen_at: string | null;
    }>) {
      if (!shiftMap.has(s.courier_user_id)) {
        shiftMap.set(s.courier_user_id, {
          status: s.status,
          last_lat: s.last_lat,
          last_lng: s.last_lng,
          last_seen_at: s.last_seen_at,
        });
      }
    }
  }

  const fleetCouriers: FleetCourier[] = couriers.map((c) => {
    const shift = shiftMap.get(c.user_id);
    return {
      user_id: c.user_id,
      full_name: c.full_name,
      vehicle_type: c.vehicle_type,
      shift_status: shift?.status ?? null,
      last_lat: shift?.last_lat ?? null,
      last_lng: shift?.last_lng ?? null,
      last_seen_at: shift?.last_seen_at ?? null,
    };
  });

  const activeOrders = (ordersData ?? []) as ActiveOrder[];
  const unassignedCount = activeOrders.filter((o) => !o.assigned_courier_user_id).length;
  const onlineCount = fleetCouriers.filter((c) => c.shift_status === 'ONLINE').length;

  // Payout this week: sum of payout_periods.total_cents where the courier is
  // in this fleet and period_start matches the current Mon-Sun.
  let payoutWeekCents = 0;
  if (courierIds.length > 0) {
    const { data: payoutData } = await admin
      .from('payout_periods')
      .select('total_cents')
      .in('courier_user_id', courierIds)
      .gte('period_start', weekStart.toISOString().slice(0, 10));
    for (const p of (payoutData ?? []) as Array<{ total_cents: number }>) {
      payoutWeekCents += p.total_cents ?? 0;
    }
  }

  return {
    activeOrders,
    couriers: fleetCouriers,
    onlineCount,
    unassignedCount,
    deliveredTodayCount: deliveredTodayCount ?? 0,
    deliveredThisWeekCount: deliveredWeekCount ?? 0,
    payoutWeekRon: payoutWeekCents / 100,
    recentDelivered: (recentDelivered ?? []) as Array<{
      id: string;
      customer_first_name: string | null;
      delivered_at: string | null;
      delivery_fee_ron: number | null;
    }>,
  };
}
