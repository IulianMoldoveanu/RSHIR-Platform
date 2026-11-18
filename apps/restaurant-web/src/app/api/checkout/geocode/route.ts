// Server-side proxy for Nominatim forward-geocoding.
//
// Why this exists: the storefront checkout used to call
// `geocodeAddressRo` directly from `CheckoutClient.tsx`, which meant every
// customer's browser hit nominatim.openstreetmap.org with the customer's
// own IP as the rate-limit key. Nominatim Usage Policy is 1 req/sec per
// IP and bans on abuse — under any real pilot traffic (Foișorul A's
// 200-500 ord/day) we'd burn through the budget on the first lunch rush
// because NAT collapses multiple customers into the same egress IP.
//
// The cache and the upstream throttle moved to lib/zones/geocode-guarded.ts
// on 2026-11-18, when the Connect order endpoint became a second caller:
// two callers each reaching for the raw helper would have shared one IP
// budget while neither respected it. This route keeps what is route-specific
// — same-origin enforcement and the per-IP limit — and delegates the rest.
//
// User-Agent is hard-coded in `lib/zones/nominatim.ts` so a missing env
// var on Vercel can't silently demote us to "ops@example.com" (which got
// flagged as bot-like in the 2026-04-28 QA audit).

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { geocodeGuarded } from '@/lib/zones/geocode-guarded';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  address: z.object({
    line1: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(80),
    postalCode: z.string().trim().max(20).optional().default(''),
    country: z.string().trim().max(40).optional().default('Romania'),
  }),
});

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json(
      { error: 'forbidden_origin', reason: origin.reason },
      { status: 403 },
    );
  }

  // 5 req/min/IP — a normal checkout flow needs at most 1-2 (initial
  // blur + recompute on edit). Scripted abuse gets a 429.
  const rl = checkLimit(`checkout-geocode:${clientIp(req)}`, {
    capacity: 5,
    refillPerSec: 5 / 60,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const { hit, cached } = await geocodeGuarded(parsed.data.address);
  if (!hit) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json(
    { lat: hit.lat, lng: hit.lng, displayName: hit.displayName, cached },
    cached ? { headers: { 'Cache-Control': 'private, max-age=3600' } } : undefined,
  );
}
