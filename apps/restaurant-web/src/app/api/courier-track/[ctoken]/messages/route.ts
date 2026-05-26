import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ ctoken: z.string().min(8).max(128) });
const bodySchema = z.object({ body: z.string().trim().min(1).max(2000) });

// Simple in-memory rate limit per ctoken (best-effort; serverless instances reset
// independently). 1 message per 2 seconds per token.
const lastPostByToken = new Map<string, number>();
const POST_INTERVAL_MS = 2000;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ ctoken: string }> }) {
  const parsed = paramsSchema.safeParse(await ctx.params);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.rpc as any)('get_courier_track_messages', {
    p_track_token: parsed.data.ctoken,
    p_limit: 50,
  });
  if (error) {
    console.error('[courier-track/messages] rpc error', error.message);
    return NextResponse.json({ error: 'rpc_failed' }, { status: 500 });
  }
  return NextResponse.json({ messages: data ?? [] }, {
    headers: { 'cache-control': 'no-store' },
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ ctoken: string }> }) {
  const parsed = paramsSchema.safeParse(await ctx.params);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_token' }, { status: 400 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const body = bodySchema.safeParse(raw);
  if (!body.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const now = Date.now();
  const last = lastPostByToken.get(parsed.data.ctoken) ?? 0;
  if (now - last < POST_INTERVAL_MS) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }
  lastPostByToken.set(parsed.data.ctoken, now);

  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.rpc as any)('post_courier_track_message', {
    p_track_token: parsed.data.ctoken,
    p_body: body.data.body,
  });
  if (error) {
    console.error('[courier-track/messages POST] rpc error', error.message);
    return NextResponse.json({ error: 'rpc_failed' }, { status: 500 });
  }
  const payload = (data ?? {}) as { ok?: boolean; error?: string; id?: string };
  if (payload.error) {
    const status = payload.error === 'not_found' ? 404 : 400;
    return NextResponse.json({ error: payload.error }, { status });
  }
  return NextResponse.json({ ok: true, id: payload.id });
}
