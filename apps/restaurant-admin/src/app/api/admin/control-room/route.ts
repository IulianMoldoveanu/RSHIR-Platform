// GET /api/admin/control-room
//
// Returns all data the Control Room client needs in a single request:
//   - courier_profiles (ACTIVE couriers only)
//   - courier_shifts (latest shift per courier, today)
//   - courier_orders (active + today's delivered)
// Uses service_role to bypass RLS (platform admin reads cross-tenant data).
// Gated by HIR_PLATFORM_ADMIN_EMAILS — identical gate to fleet-allocation.

import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const [profilesRes, shiftsRes, ordersRes] = await Promise.all([
    // courier_profiles is keyed by user_id (PK); the public-facing name is
    // `full_name` (not `display_name`). avatar_url + max_parallel_orders
    // are added in later migrations (20260505_005, 20260522_003).
    sb
      .from('courier_profiles')
      .select('user_id, full_name, phone, avatar_url, status, max_parallel_orders')
      .eq('status', 'ACTIVE'),

    sb
      .from('courier_shifts')
      .select('courier_user_id, started_at, ended_at, status, last_lat, last_lng, last_seen_at')
      .gte('started_at', todayIso)
      .order('started_at', { ascending: false }),

    // courier_orders uses `pickup_line1` / `dropoff_line1` for addresses
    // (per 20260428_001_courier_app_scaffold.sql); `customer_address` /
    // `pickup_address` were never created. There are no dedicated
    // picked_up_at / delivered_at columns — we proxy with status + updated_at
    // and the client derives transition times if needed.
    sb
      .from('courier_orders')
      .select(
        'id, source_tenant_id, assigned_courier_user_id, status, delivery_fee_ron, pickup_line1, dropoff_line1, dropoff_lat, dropoff_lng, created_at, updated_at',
      )
      .gte('created_at', todayIso)
      .order('created_at', { ascending: false }),
  ]);

  if (profilesRes.error) {
    return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  }
  if (shiftsRes.error) {
    return NextResponse.json({ error: shiftsRes.error.message }, { status: 500 });
  }
  if (ordersRes.error) {
    return NextResponse.json({ error: ordersRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    profiles: profilesRes.data ?? [],
    shifts: shiftsRes.data ?? [],
    orders: ordersRes.data ?? [],
    fetched_at: new Date().toISOString(),
  });
}
