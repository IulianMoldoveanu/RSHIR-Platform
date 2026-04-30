import { NextRequest, NextResponse } from 'next/server';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { assertSameOrigin } from '@/lib/origin-check';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  const ip = clientIp(req);
  const limit = checkLimit(`notify-live:${ip}`, { capacity: 5, refillPerSec: 1 / 12 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'too_many_requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { email, tenant_slug } = body as { email?: unknown; tenant_slug?: unknown };

  if (
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254
  ) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 422 });
  }
  if (typeof tenant_slug !== 'string' || tenant_slug.length === 0 || tenant_slug.length > 100) {
    return NextResponse.json({ error: 'invalid_tenant' }, { status: 422 });
  }

  const admin = getSupabaseAdmin();
  const { error: dbError } = await (admin as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  })
    .from('storefront_notify_signups')
    .insert({ email, tenant_slug, ip: ip.startsWith('noip:') ? null : ip });

  if (dbError) {
    console.error('[notify-when-live] insert failed', dbError.message);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
