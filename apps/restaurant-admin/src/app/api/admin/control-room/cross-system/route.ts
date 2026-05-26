// Wave 4 — Cross-system snapshot endpoint for the Control Room.
// Returns live_ops_telemetry rows + unresolved ops_alerts. Platform-admin
// only.

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email || !isPlatformAdminEmail(user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const [telemetryRes, alertsRes] = await Promise.all([
    admin
      .from('live_ops_telemetry')
      .select(
        'tenant_id, tenant_name, tenant_slug, kitchen_queue, in_courier_flow, dispatched_unpicked_over_5m, kitchen_overdue_over_15m, delivered_24h, revenue_24h_ron, last_order_at',
      ),
    admin
      .from('ops_alerts')
      .select('id, tenant_id, alert_type, severity, message, created_at')
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    telemetry: telemetryRes.data ?? [],
    alerts: alertsRes.data ?? [],
    fetched_at: new Date().toISOString(),
  });
}
