import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ token: z.string().uuid() });

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const parsed = paramsSchema.safeParse(await ctx.params);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.rpc as any)('get_linked_courier_track_token', {
    p_restaurant_token: parsed.data.token,
  });
  if (error) {
    console.error('[track/courier-token] rpc error', error.message);
    return NextResponse.json({ error: 'rpc_failed' }, { status: 500 });
  }
  return NextResponse.json({ courierTrackToken: (data as string | null) ?? null }, {
    headers: { 'cache-control': 'no-store' },
  });
}
