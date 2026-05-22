import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { courier_user_id: string };

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

  const { courier_user_id } = body;
  if (!courier_user_id) {
    return NextResponse.json({ error: 'courier_user_id required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify courier has an ONLINE shift.
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

  // TODO: check max_parallel_orders when column exists:
  //   const { count } = await admin.from('courier_orders')
  //     .select('id', { count: 'exact', head: true })
  //     .eq('assigned_courier_user_id', courier_user_id)
  //     .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);
  //   if (count >= profile.max_parallel_orders) return 422;

  // Atomic assign — only succeeds if order is still unassigned.
  const { data: updated, error } = await admin
    .from('courier_orders')
    .update({
      assigned_courier_user_id: courier_user_id,
      status: 'ACCEPTED',
      assigned_at: new Date().toISOString(),
    })
    .eq('id', orderId)
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
