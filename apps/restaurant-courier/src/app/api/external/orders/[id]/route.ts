import { NextResponse, type NextRequest } from 'next/server';
import { authenticateApiKey } from '@/lib/api-key';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const query = admin
    .from('courier_orders')
    .select('id, source_order_id, source_tenant_id, status, public_track_token, created_at, updated_at')
    .eq('id', (await ctx.params).id);

  // Tenant-scoped: an HIR tenant can only see its own orders. External API
  // keys can only see orders posted with that key (no tenant id).
  if (auth.ctx.hirTenantId) {
    query.eq('source_tenant_id', auth.ctx.hirTenantId);
  } else {
    query.is('source_tenant_id', null);
  }

  const { data } = await query.maybeSingle();
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const row = data as {
    id: string;
    source_order_id: string;
    status: string;
    public_track_token: string;
    created_at: string;
    updated_at: string;
  };

  return NextResponse.json({
    id: row.id,
    externalOrderId: row.source_order_id,
    status: row.status,
    publicTrackToken: row.public_track_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
