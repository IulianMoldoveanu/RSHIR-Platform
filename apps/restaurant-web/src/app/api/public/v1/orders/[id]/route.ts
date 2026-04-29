// RSHIR-52: GET /api/public/v1/orders/:id
// Returns current status of an order. Same Bearer auth as the POST route.
// 404 if the order doesn't belong to the authenticated tenant.

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkLimit } from '@/lib/rate-limit';
import { authenticateBearerKey } from '../../auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const authed = await authenticateBearerKey(req.headers.get('authorization'));
  if (!authed) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!authed.scopes.includes('orders.read')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Rate-limit per API key. Reads are cheaper than writes, so 600/min is
  // a fine ceiling for a polling POS without inviting abuse from a leaked
  // key.
  const rl = checkLimit(`pub-orders-read:${authed.keyId}`, {
    capacity: 600,
    refillPerSec: 10,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const { id } = params;
  const admin = getSupabaseAdmin();

  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: {
                id: string;
                status: string;
                payment_status: string;
                total_ron: number;
                created_at: string;
                updated_at: string;
              } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };

  const { data, error } = await sb
    .from('restaurant_orders')
    .select('id, status, payment_status, total_ron, created_at, updated_at')
    .eq('id', id)
    .eq('tenant_id', authed.tenantId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({
    id: data.id,
    status: data.status,
    payment_status: data.payment_status,
    total_ron: data.total_ron,
    created_at: data.created_at,
    updated_at: data.updated_at,
  });
}
