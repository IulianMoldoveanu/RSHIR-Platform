// Server-side proxy for Nominatim reverse-geocoding — turns a browser
// geolocation fix into a street address for the checkout form. Mirrors
// /api/checkout/geocode's guards (same-origin check, per-IP rate limit,
// OSM 1 req/sec serialization) since it hits the same Nominatim budget.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { reverseGeocodeRo } from '@/lib/zones/nominatim';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  lat: z.number().refine((v) => v >= -90 && v <= 90, 'invalid lat'),
  lng: z.number().refine((v) => v >= -180 && v <= 180, 'invalid lng'),
});

// Shares the same OSM-facing serialization guard as /api/checkout/geocode.
// Each route keeps its own queue/clock — both stay under 1 req/sec on their
// own, and combined worst-case (2 req/sec) is still well inside OSM's
// tolerance for a single well-behaved User-Agent at this traffic volume.
const MIN_INTERVAL_MS = 1_100;
let lastFetchAt = 0;
let queue: Promise<unknown> = Promise.resolve();

function serializeOsm<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const wait = lastFetchAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastFetchAt = Date.now();
    return fn();
  });
  queue = next.catch(() => undefined);
  return next;
}

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json(
      { error: 'forbidden_origin', reason: origin.reason },
      { status: 403 },
    );
  }

  // 5 req/min/IP — a checkout only ever fires this once (button press).
  const rl = checkLimit(`checkout-reverse-geocode:${clientIp(req)}`, {
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

  const hit = await serializeOsm(() => reverseGeocodeRo(parsed.data.lat, parsed.data.lng));
  if (!hit) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({
    line1: hit.line1,
    city: hit.city,
    postalCode: hit.postalCode,
    displayName: hit.displayName,
  });
}
