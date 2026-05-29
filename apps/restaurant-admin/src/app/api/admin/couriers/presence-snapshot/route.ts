// Audit P0 #11 — admin-only cross-fleet courier presence snapshot.
//
// Replaces what the global `couriers:presence` channel used to give us for
// free (every courier on the platform visible to every client). The
// global channel leaked across tenants; this endpoint is the sanctioned
// path: server-side aggregate, platform-admin only, returns counts +
// per-fleet breakdown but NOT individual user ids.

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

  // Online = courier has an open shift (status ONLINE, ended_at null) and
  // a recent ping. We treat anything pinged in the last 5 minutes as live;
  // anything older is stale (courier likely left the app open offline).
  const FIVE_MIN_AGO = new Date(Date.now() - 5 * 60_000).toISOString();

  const { data: shifts } = await admin
    .from('courier_shifts')
    .select('courier_user_id, last_seen_at')
    .eq('status', 'ONLINE')
    .is('ended_at', null)
    .gte('last_seen_at', FIVE_MIN_AGO);

  const userIds = Array.from(
    new Set(
      ((shifts ?? []) as { courier_user_id: string | null }[])
        .map((r) => r.courier_user_id)
        .filter((id): id is string => typeof id === 'string'),
    ),
  );

  let perFleet: Record<string, number> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from('courier_profiles')
      .select('user_id, fleet_id')
      .in('user_id', userIds);

    for (const p of (profiles ?? []) as { fleet_id: string | null }[]) {
      const key = p.fleet_id ?? '_no_fleet';
      perFleet[key] = (perFleet[key] ?? 0) + 1;
    }
  }

  return NextResponse.json(
    {
      total_online: userIds.length,
      per_fleet: perFleet,
      window_seconds: 300,
      as_of: new Date().toISOString(),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
