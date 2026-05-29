// POST /api/admin/couriers/[id]/max-parallel
//
// Updates courier_profiles.max_parallel_orders (1..10 or null = unlimited).
// Gated by platform-admin allow-list.

import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'missing courier id' }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { max_parallel_orders?: number | null } | null;
  if (!body || (body.max_parallel_orders !== null && body.max_parallel_orders !== undefined && (typeof body.max_parallel_orders !== 'number' || body.max_parallel_orders < 1 || body.max_parallel_orders > 10))) {
    return NextResponse.json({ error: 'max_parallel_orders must be 1..10 or null' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;
  const { error } = await sb
    .from('courier_profiles')
    .update({ max_parallel_orders: body.max_parallel_orders ?? null })
    .eq('user_id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
