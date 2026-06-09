/**
 * POST /api/orders/[id]/self-pickup
 *
 * Self-pickup stub — assigns the calling courier to an unassigned order
 * and moves it to ACCEPTED.
 *
 * This mirrors acceptOrderAction() from dashboard/actions.ts but as a
 * JSON API route so the client-side PoolView can call it with fetch()
 * and get a typed JSON response without triggering a full page revalidation
 * cycle (the Realtime subscription handles the live update on all peers).
 *
 * Security:
 *   - Auth via Supabase session cookie (same as all server actions).
 *   - Fleet ownership check: the order's fleet_id must match the courier's
 *     fleet_id. Admin client bypasses RLS, so the check is explicit here.
 *   - State-machine guard: only CREATED or OFFERED + IS NULL assigned_courier.
 *
 * Depends on PR #717 (max_parallel_orders column on courier_profiles).
 * Until that PR lands, the parallel-order limit check is a no-op (the column
 * defaults to NULL = unlimited).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Resolve auth
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: 'Missing order id' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolve courier's fleet + active order count in one round-trip.
  const { data: profile } = await admin
    .from('courier_profiles')
    .select('fleet_id, max_parallel_orders')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: 'Courier profile not found' }, { status: 403 });
  }

  // KYC gate (per-fleet, default off): blocks taking orders when the courier's
  // fleet requires KYC and the courier is not VERIFIED. No-op while every fleet
  // has kyc_required=false.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: canTake } = await (admin.rpc as any)('courier_can_take_orders', {
    p_user_id: user.id,
  });
  if (canTake === false) {
    return NextResponse.json({ error: 'kyc_required' }, { status: 403 });
  }

  const profileRow = profile as {
    fleet_id: string | null;
    max_parallel_orders: number | null;
  };

  // Check parallel order limit (PR #717). NULL = unlimited.
  if (profileRow.max_parallel_orders != null) {
    const { count: activeCount } = await admin
      .from('courier_orders')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_courier_user_id', user.id)
      .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);

    if ((activeCount ?? 0) >= profileRow.max_parallel_orders) {
      return NextResponse.json(
        { error: 'limit_reached', max: profileRow.max_parallel_orders },
        { status: 422 },
      );
    }
  }

  // Atomic claim: UPDATE returns the row only if all conditions match.
  // The fleet_id check replaces the RLS that the admin client bypasses.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let updateQuery: any = admin
    .from('courier_orders')
    .update({
      status: 'ACCEPTED',
      assigned_courier_user_id: user.id,
      updated_at: new Date().toISOString(),
    })
    .in('status', ['CREATED', 'OFFERED'])
    .is('assigned_courier_user_id', null)
    .eq('id', orderId);

  // Fleet isolation. A courier with a fleet may only claim that fleet's
  // orders. A fleetless (platform-default) courier is scoped to platform
  // orders (fleet_id IS NULL) — previously the filter was SKIPPED entirely,
  // which let a fleetless rider claim ANY fleet's order by id (a cross-fleet
  // bypass). Scoping to IS NULL closes that while preserving the legit
  // platform-courier path.
  if (profileRow.fleet_id) {
    updateQuery = updateQuery.eq('fleet_id', profileRow.fleet_id);
  } else {
    updateQuery = updateQuery.is('fleet_id', null);
  }

  const { data: claimed } = await updateQuery.select('id').maybeSingle();

  if (!claimed) {
    // Race condition: another courier claimed it first, or it's in a wrong state.
    return NextResponse.json({ error: 'already_taken' }, { status: 409 });
  }

  return NextResponse.json({ ok: true, orderId });
}
