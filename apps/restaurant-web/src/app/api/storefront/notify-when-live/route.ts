import { NextRequest, NextResponse } from 'next/server';
import { checkLimit, clientIp } from '@/lib/rate-limit';

// TODO: persist to a `storefront_notify_signups` table (email, tenant_slug,
// created_at) once a migration is in scope. For MVP we log and return ok so
// the UI flow works without a schema change.

export async function POST(req: NextRequest) {
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

  // TODO: insert into storefront_notify_signups table when migration lands.
  console.info('[notify-when-live] signup', { email, tenant_slug, ip });

  return NextResponse.json({ ok: true });
}
