import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ token: z.string().uuid() });

// Tags the customer-facing widget can send. Kept in sync with the whitelist in
// submit_delivery_rating (the DB also re-validates).
const bodySchema = z.object({
  stars: z.number().int().min(1).max(5),
  tags: z.array(z.enum(['POLITE', 'ON_TIME', 'CAREFUL'])).max(3).optional(),
  comment: z.string().max(500).optional(),
});

// Anonymous courier rating. Auth model is "you hold the restaurant order's
// public_track_token" — identical to the restaurant review route. We resolve
// the LINKED courier order's track token server-side, then call
// submit_delivery_rating (which re-checks DELIVERED + one-rating-per-order).
// IP rate-limited because it is unauthenticated.
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const params = paramsSchema.safeParse(await ctx.params);
  if (!params.success) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  const ip = clientIp(req);
  const limit = checkLimit(`courier-rating:${ip}`, { capacity: 5, refillPerSec: 1 / 60 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const body = bodySchema.safeParse(payload);
  if (!body.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Resolve the linked courier order's public track token from the restaurant
  // token (same RPC the live ETA map + chat use).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linked = await (admin.rpc as any)('get_linked_courier_track_token', {
    p_restaurant_token: params.data.token,
  });
  if (linked.error) {
    console.error('[track/courier-rating] link rpc error', linked.error.message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  const courierToken = (linked.data as string | null) ?? null;
  if (!courierToken) {
    // No courier order linked (pickup, or never dispatched) — nothing to rate.
    return NextResponse.json({ ok: false, error: 'no_courier_order' }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.rpc as any)('submit_delivery_rating', {
    p_track_token: courierToken,
    p_stars: body.data.stars,
    p_tags: body.data.tags ?? [],
    p_comment: body.data.comment ?? null,
  });

  if (error) {
    // Don't echo DB error strings to anonymous callers.
    console.error('[track/courier-rating] submit_delivery_rating failed', error.message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const result = (data ?? {}) as { ok?: boolean; reason?: string };
  if (result.ok) {
    return NextResponse.json({ ok: true });
  }
  const statusByReason: Record<string, number> = {
    order_not_found: 404,
    not_delivered: 409,
    already_rated: 409,
    invalid_stars: 400,
    invalid_tag: 400,
  };
  const reason = result.reason ?? 'unknown';
  return NextResponse.json({ ok: false, error: reason }, { status: statusByReason[reason] ?? 400 });
}
