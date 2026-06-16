import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { courier_user_id: string; tenantSlug: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { courier_user_id, tenantSlug } = body;
  if (!courier_user_id) {
    return NextResponse.json({ error: 'courier_user_id required' }, { status: 400 });
  }
  if (!tenantSlug) {
    return NextResponse.json({ error: 'tenantSlug required' }, { status: 400 });
  }

  // Defense-in-depth: this route trusts a courier_user_id from the body, so
  // require the display device to have passed the PIN gate (the auth route
  // sets display-auth-<slug>). Without the cookie → 401, even if a valid
  // courier id is supplied.
  const cookieStore = await cookies();
  if (!cookieStore.get(`display-auth-${tenantSlug}`)) {
    return NextResponse.json({ error: 'Display neautentificat' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Resolve tenantSlug → tenant_id so we can confirm the order belongs to the
  // tenant this display is authenticated for (no cross-tenant self-pickup).
  const { data: tenant } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlug)
    .maybeSingle();
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant inexistent' }, { status: 404 });
  }

  // Verify courier has an ONLINE shift + resolve their fleet. A tablet operator
  // must not be able to assign a courier from an UNRELATED fleet to this
  // tenant's order — so we bind the claim to the courier's own fleet below.
  const [{ data: shift }, { data: courierProfile }] = await Promise.all([
    admin
      .from('courier_shifts')
      .select('id')
      .eq('courier_user_id', courier_user_id)
      .eq('status', 'ONLINE')
      .limit(1)
      .maybeSingle(),
    admin
      .from('courier_profiles')
      .select('fleet_id, status')
      .eq('user_id', courier_user_id)
      .maybeSingle(),
  ]);

  if (!shift) {
    return NextResponse.json(
      { error: 'Curierul nu are o tură ONLINE activă' },
      { status: 422 },
    );
  }
  if (!courierProfile) {
    return NextResponse.json({ error: 'Curier inexistent' }, { status: 404 });
  }
  const courierRow = courierProfile as { fleet_id: string | null; status: string | null };
  const courierFleetId = courierRow.fleet_id;

  // A suspended courier (suspended mid-shift) or one in a deactivated fleet
  // cannot be assigned new orders from the tablet. The admin client bypasses
  // the courier_orders RLS that enforces fleet.is_active, so gate explicitly.
  if (courierRow.status === 'SUSPENDED') {
    return NextResponse.json({ error: 'Curierul este suspendat' }, { status: 422 });
  }
  if (courierFleetId) {
    const { data: fleetRow } = await admin
      .from('courier_fleets')
      .select('is_active')
      .eq('id', courierFleetId)
      .maybeSingle();
    if (!(fleetRow as { is_active: boolean } | null)?.is_active) {
      return NextResponse.json({ error: 'Flota curierului este inactivă' }, { status: 422 });
    }
  }

  // TODO: check max_parallel_orders when column exists:
  //   const { count } = await admin.from('courier_orders')
  //     .select('id', { count: 'exact', head: true })
  //     .eq('assigned_courier_user_id', courier_user_id)
  //     .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);
  //   if (count >= profile.max_parallel_orders) return 422;

  // Atomic assign — only succeeds if order is still unassigned AND belongs to
  // the tenant this display is authenticated for (source_tenant_id match
  // prevents claiming another tenant's order from this tablet).
  let claim = admin
    .from('courier_orders')
    .update({
      assigned_courier_user_id: courier_user_id,
      status: 'ACCEPTED',
      assigned_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('source_tenant_id', tenant.id)
    .is('assigned_courier_user_id', null)
    .in('status', ['CREATED', 'OFFERED']);
  // Fleet binding: the order must belong to the courier's fleet (or both be
  // platform/null-fleet). Closes the cross-fleet assignment gap.
  claim = courierFleetId ? claim.eq('fleet_id', courierFleetId) : claim.is('fleet_id', null);

  const { data: updated, error } = await claim
    .select('id, assigned_courier_user_id')
    .maybeSingle();

  if (error) {
    console.error('[self-pickup] db error', error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  if (!updated) {
    // Either already taken or wrong status.
    return NextResponse.json(
      { error: 'Comanda a fost deja luată sau nu mai este disponibilă' },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, order_id: orderId });
}
