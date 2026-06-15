import { NextResponse, type NextRequest } from 'next/server';
import { authenticateApiKey } from '@/lib/api-key';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWebhook } from '@/lib/webhook';

export const dynamic = 'force-dynamic';

const CANCELLABLE = ['CREATED', 'OFFERED', 'ACCEPTED'];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();

  // Verify ownership first.
  // 2026-06-15 — IDOR + TOCTOU fix: external API keys are scoped by FLEET
  // (not just "no tenant id"). Update WHERE includes the same scope guard
  // so a concurrent ownership change between SELECT and UPDATE cannot
  // bypass the check.
  const orderId = (await ctx.params).id;
  const lookup = admin
    .from('courier_orders')
    .select('id, source_tenant_id, status, fleet_id')
    .eq('id', orderId);
  if (auth.ctx.hirTenantId) {
    lookup.eq('source_tenant_id', auth.ctx.hirTenantId);
  } else {
    lookup.is('source_tenant_id', null).eq('fleet_id', auth.ctx.fleetId);
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

  let updateQuery = admin
    .from('courier_orders')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .in('status', CANCELLABLE);
  if (auth.ctx.hirTenantId) {
    updateQuery = updateQuery.eq('source_tenant_id', auth.ctx.hirTenantId);
  } else {
    updateQuery = updateQuery.is('source_tenant_id', null).eq('fleet_id', auth.ctx.fleetId);
  }
  const { data, error } = await updateQuery
    .select('id, source_order_id, status, public_track_token, created_at, updated_at')
    .maybeSingle();
  if (!data && !error) {
    return NextResponse.json({ error: 'not_cancellable_race' }, { status: 409 });
  }

  if (error) {
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

  // Fire-and-forget webhook to the third-party that posted the order. Never
  // throws — the helper updates the order's webhook bookkeeping fields.
  void sendWebhook(out.id, {
    event: 'order.cancelled',
    orderId: out.id,
    externalOrderId: out.source_order_id ?? null,
    status: out.status,
    occurredAt: out.updated_at,
  });

  return NextResponse.json({
    id: out.id,
    externalOrderId: out.source_order_id,
    status: out.status,
    publicTrackToken: out.public_track_token,
    createdAt: out.created_at,
    updatedAt: out.updated_at,
  });
}
