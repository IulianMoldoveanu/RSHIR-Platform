import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ token: z.string().uuid() });

const bodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

// RSHIR-39: anonymous customer submission. Auth is "you know the order's
// public_track_token" — same trust model as the GET endpoint. The DB function
// enforces status=DELIVERED and a single review per order; we still
// rate-limit by IP because the route is unauthenticated.
export async function POST(req: NextRequest, ctx: { params: { token: string } }) {
  const params = paramsSchema.safeParse(ctx.params);
  if (!params.success) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  const ip = clientIp(req);
  const limit = checkLimit(`review:${ip}`, { capacity: 5, refillPerSec: 1 / 60 });
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
  const { data, error } = await admin.rpc('submit_order_review', {
    p_token: params.data.token,
    p_rating: body.data.rating,
    p_comment: body.data.comment ?? '',
  });

  if (error) {
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
  }

  const result = String(data);
  if (result === 'ok') {
    return NextResponse.json({ ok: true });
  }
  // Map DB sentinel values to HTTP status. None of these reveal info that
  // the caller didn't already have (they were holding the token).
  const statusByResult: Record<string, number> = {
    not_found: 404,
    not_delivered: 409,
    already_reviewed: 409,
    invalid_rating: 400,
  };
  return NextResponse.json(
    { ok: false, error: result },
    { status: statusByResult[result] ?? 400 },
  );
}
