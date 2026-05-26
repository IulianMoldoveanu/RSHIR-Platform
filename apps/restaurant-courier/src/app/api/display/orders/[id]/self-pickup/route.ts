import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { DISPLAY_TENANT_COOKIE } from '../../../auth/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { courier_user_id: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;

  // ── 1. Caller authorization: must come from an authenticated kiosk tablet.
  // The display-tenant cookie is set by /api/display/auth after a successful
  // PIN check and carries the tenant UUID the tablet is bound to. Without it,
  // any app user could POST to this admin-client-backed endpoint and assign
  // arbitrary orders to arbitrary couriers (order-hijack vector flagged by
  // Codex P1 review).
  const cookieStore = await cookies();
  const tenantIdCookie = cookieStore.get(DISPLAY_TENANT_COOKIE)?.value;
  if (!tenantIdCookie) {
    return NextResponse.json(
      { error: 'Tableta nu este autentificată cu PIN' },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { courier_user_id } = body;
  if (!courier_user_id) {
    return NextResponse.json({ error: 'courier_user_id required' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // ── 2. Order scope: order must belong to the tenant whose PIN unlocked the
  // tablet. Prevents a tablet at tenant A from claiming orders at tenant B.
  const { data: orderRow } = await admin
    .from('courier_orders')
    .select('source_tenant_id')
    .eq('id', orderId)
    .maybeSingle();

  if (!orderRow || orderRow.source_tenant_id !== tenantIdCookie) {
    return NextResponse.json(
      { error: 'Comanda nu aparține acestei locații' },
      { status: 403 },
    );
  }

  // ── 3. Courier must have an ONLINE shift.
  const { data: shift } = await admin
    .from('courier_shifts')
    .select('id')
    .eq('courier_user_id', courier_user_id)
    .eq('status', 'ONLINE')
    .limit(1)
    .maybeSingle();

  if (!shift) {
    return NextResponse.json(
      { error: 'Curierul nu are o tură ONLINE activă' },
      { status: 422 },
    );
  }

  // ── 4. max_parallel_orders enforcement (PR #717 column).
  const { data: profile } = await admin
    .from('courier_profiles')
    .select('max_parallel_orders')
    .eq('user_id', courier_user_id)
    .maybeSingle();

  if (profile?.max_parallel_orders != null) {
    const { count: activeCount } = await admin
      .from('courier_orders')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_courier_user_id', courier_user_id)
      .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);

    if ((activeCount ?? 0) >= profile.max_parallel_orders) {
      return NextResponse.json(
        { error: 'limit_reached', max: profile.max_parallel_orders },
        { status: 422 },
      );
    }
  }

  // ── 5. Atomic assign — only succeeds if order is still unassigned.
  const { data: updated, error } = await admin
    .from('courier_orders')
    .update({
      assigned_courier_user_id: courier_user_id,
      status: 'ACCEPTED',
      assigned_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('source_tenant_id', tenantIdCookie)
    .is('assigned_courier_user_id', null)
    .in('status', ['CREATED', 'OFFERED'])
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
