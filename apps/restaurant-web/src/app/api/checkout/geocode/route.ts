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
// This route fronts OSM with three guards:
//   1. per-IP rate limit (5/min) — keeps abusive scripts off our budget
//   2. in-memory LRU cache (24h TTL) — a building only needs to be
//      geocoded once per day; "Strada X 12, Brașov" hashes to the same
//      key whether 50 customers type it or 1
//   3. global serialization (1 req/sec floor) — respects OSM's hard
//      policy regardless of traffic shape
//
// User-Agent is hard-coded in `lib/zones/nominatim.ts` so a missing env
// var on Vercel can't silently demote us to "ops@example.com" (which got
// flagged as bot-like in the 2026-04-28 QA audit).
//
// Single-instance only — replace LRU + queue with a shared Redis when we
// scale beyond one Vercel serverless function. The pilot is fine on this.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { geocodeAddressRoVerbose } from '@/lib/zones/nominatim';

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

type CacheEntry = { lat: number; lng: number; displayName: string; expiresAt: number };

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5_000;

const cache = new Map<string, CacheEntry>();

function cacheKey(line1: string, city: string, postalCode: string, country: string): string {
  // Normalise — case + whitespace + diacritic-insensitive enough that
  // "Strada Mihai", "  strada mihai " and "STRADA MIHAI" collapse to one
  // cache row. NFKD strips combining marks (ă -> a, ț -> t), which we
  // want for cache keys (cache hits don't change query semantics; the
  // raw text is still sent to Nominatim verbatim by the caller).
  const norm = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  const payload = `${norm(line1)}|${norm(city)}|${norm(postalCode)}|${norm(country)}`;
  return createHash('sha1').update(payload).digest('hex');
}

function cacheGet(key: string): CacheEntry | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  // LRU touch — re-insert moves to tail.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cacheSet(key: string, entry: CacheEntry): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, entry);
}

// Global queue — guarantees we never burst above OSM's 1 req/sec hard
// policy even if every Vercel cold-start serves traffic simultaneously.
// A single Vercel instance can still parallelise multiple users behind
// the same async event loop; the queue forces them to wait their turn.
// 1.1s spacing gives a small safety margin.
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
  // The shared queue tail tracks completion (success or failure) so the
  // next caller is gated either way — but the returned promise must
  // surface the original error to *this* caller.
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

  const { line1, city, postalCode, country } = parsed.data.address;
  const key = cacheKey(line1, city, postalCode, country);
  const cached = cacheGet(key);
  if (cached) {
    return NextResponse.json(
      { lat: cached.lat, lng: cached.lng, displayName: cached.displayName, cached: true },
      { headers: { 'Cache-Control': 'private, max-age=3600' } },
    );
  }

  const q = [line1, city, postalCode, country].filter((s) => s.trim().length > 0).join(', ');
  const hit = await serializeOsm(() => geocodeAddressRoVerbose(q));
  if (!hit) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  cacheSet(key, {
    lat: hit.lat,
    lng: hit.lng,
    displayName: hit.displayName,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return NextResponse.json({
    lat: hit.lat,
    lng: hit.lng,
    displayName: hit.displayName,
    cached: false,
  });
}
