// /dashboard/admin/control-room
//
// Live courier ops dashboard for platform admins (Iulian pilot — Brașov Centrul Civic).
// Server component: provides fast first paint with initial data.
// Client component handles auto-refresh every 30s via SWR + all interactions.
//
// Uses ONLY existing tables: courier_profiles, courier_shifts, courier_orders.
// No schema changes required. Uses service_role in the API route to bypass RLS.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { ControlRoomClient } from './_components/control-room-client';
import { CrossSystemPanel } from './_components/cross-system-panel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ControlRoomPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/control-room');

  if (!isPlatformAdminEmail(user.email)) {
    return (
      <main className="min-h-screen bg-zinc-50 p-10">
        <div className="mx-auto max-w-2xl rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Acces interzis: această pagină este rezervată administratorilor de
          platformă HIR.
        </div>
      </main>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const [profilesRes, shiftsRes, ordersRes] = await Promise.all([
    sb
      .from('courier_profiles')
      .select('id, user_id, display_name, phone, avatar_url, status, max_parallel_orders')
      .eq('status', 'ACTIVE'),
    sb
      .from('courier_shifts')
      .select('courier_user_id, started_at, ended_at, status, last_lat, last_lng, last_seen_at')
      .gte('started_at', todayIso)
      .order('started_at', { ascending: false }),
    sb
      .from('courier_orders')
      .select(
        'id, source_tenant_id, assigned_courier_user_id, status, delivery_fee_ron, customer_address, pickup_address, created_at, picked_up_at, delivered_at',
      )
      .gte('created_at', todayIso)
      .order('created_at', { ascending: false }),
  ]);

  const initialData = {
    profiles: profilesRes.data ?? [],
    shifts: shiftsRes.data ?? [],
    orders: ordersRes.data ?? [],
    fetched_at: new Date().toISOString(),
  };

  // Wave 4 — cross-system telemetry + unresolved alerts initial payload.
  const [telemetryRes, alertsRes] = await Promise.all([
    sb
      .from('live_ops_telemetry')
      .select(
        'tenant_id, tenant_name, tenant_slug, kitchen_queue, in_courier_flow, dispatched_unpicked_over_5m, kitchen_overdue_over_15m, delivered_24h, revenue_24h_ron, last_order_at',
      ),
    sb
      .from('ops_alerts')
      .select('id, tenant_id, alert_type, severity, message, created_at')
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const crossInitial = {
    telemetry: telemetryRes.data ?? [],
    alerts: alertsRes.data ?? [],
    fetched_at: new Date().toISOString(),
  };

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 p-6">
        <CrossSystemPanel initial={crossInitial} />
        <ControlRoomClient initialData={initialData} />
      </div>
    </main>
  );
}
