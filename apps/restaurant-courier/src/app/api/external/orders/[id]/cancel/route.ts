import { NextResponse, type NextRequest } from 'next/server';
import { authenticateApiKey } from '@/lib/api-key';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const CANCELLABLE = ['CREATED', 'OFFERED', 'ACCEPTED'];

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();

  // Verify ownership first.
  const lookup = admin
    .from('courier_orders')
    .select('id, source_tenant_id, status')
    .eq('id', ctx.params.id);
  if (auth.ctx.hirTenantId) {
    lookup.eq('source_tenant_id', auth.ctx.hirTenantId);
  } else {
    lookup.is('source_tenant_id', null);
  }
  const { data: existing } = await lookup.maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const row = existing as { id: string; status: string };
  if (!CANCELLABLE.includes(row.status)) {
    return NextResponse.json(
      { error: 'not_cancellable', status: row.status },
      { status: 409 },
    );
  }

  const { data, error } = await admin
    .from('courier_orders')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('id', ctx.params.id)
    .select('id, source_order_id, status, public_track_token, created_at, updated_at')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'cancel_failed' }, { status: 500 });
  }

  const out = data as {
    id: string;
    source_order_id: string;
    status: string;
    public_track_token: string;
    created_at: string;
    updated_at: string;
  };

  return NextResponse.json({
    id: out.id,
    externalOrderId: out.source_order_id,
    status: out.status,
    publicTrackToken: out.public_track_token,
    createdAt: out.created_at,
    updatedAt: out.updated_at,
  });
}
