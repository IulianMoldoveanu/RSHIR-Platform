import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ ctoken: z.string().min(8).max(128) });

export async function GET(_req: Request, ctx: { params: Promise<{ ctoken: string }> }) {
  const parsed = paramsSchema.safeParse(await ctx.params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }
  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.rpc as any)('get_courier_track', {
    p_track_token: parsed.data.ctoken,
  });
  if (error) {
    console.error('[courier-track] rpc error', error.message);
    return NextResponse.json({ error: 'rpc_failed' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(data, {
    headers: { 'cache-control': 'no-store' },
  });
}
