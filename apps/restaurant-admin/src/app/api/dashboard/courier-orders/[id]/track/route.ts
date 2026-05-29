// Admin-side tracking lookup for the per-order courier mini-map.
// Auth: caller must be a tenant member of the order's source_tenant_id.
// Returns shape mirrors /api/courier-track on restaurant-web but authenticated.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const parsed = paramsSchema.safeParse(await ctx.params);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { tenant } = await getActiveTenant();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: co } = await admin
    .from('courier_orders')
    .select(
      'id, status, source_tenant_id, assigned_courier_user_id, pickup_lat, pickup_lng, pickup_line1, dropoff_lat, dropoff_lng, dropoff_line1, created_at, updated_at',
    )
    .eq('id', parsed.data.id)
    .maybeSingle();

  if (!co) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (co.source_tenant_id && co.source_tenant_id !== tenant.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let courier: {
    first_name: string;
    last_lat: number | null;
    last_lng: number | null;
    last_seen_at: string | null;
  } | null = null;

  if (co.assigned_courier_user_id) {
    const [{ data: profile }, { data: shift }] = await Promise.all([
      admin
        .from('courier_profiles')
        .select('full_name')
        .eq('user_id', co.assigned_courier_user_id)
        .maybeSingle(),
      admin
        .from('courier_shifts')
        .select('last_lat, last_lng, last_seen_at')
        .eq('courier_user_id', co.assigned_courier_user_id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    courier = {
      first_name: ((profile?.full_name as string | undefined) ?? '').split(' ')[0] || 'Curier',
      last_lat: (shift?.last_lat as number | null) ?? null,
      last_lng: (shift?.last_lng as number | null) ?? null,
      last_seen_at: (shift?.last_seen_at as string | null) ?? null,
    };
  }

  return NextResponse.json(
    {
      courier_order_id: co.id,
      status: co.status,
      // Exposed so the mini-map can subscribe to courier_shifts UPDATE for
      // GPS pings (audit P0 #8 realtime upgrade).
      assigned_courier_user_id: co.assigned_courier_user_id ?? null,
      pickup: { lat: co.pickup_lat, lng: co.pickup_lng, address: co.pickup_line1 },
      dropoff: { lat: co.dropoff_lat, lng: co.dropoff_lng, address: co.dropoff_line1 },
      courier,
      updated_at: co.updated_at,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
