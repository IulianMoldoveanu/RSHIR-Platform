// Guarded forward-geocoding: every Nominatim lookup in this app goes through
// here, so there is exactly one cache and one upstream throttle.
//
// Extracted from api/checkout/geocode/route.ts on 2026-11-18. It had lived
// inside that route since the storefront stopped calling Nominatim from the
// browser, which was fine while checkout was the only caller. Then the Connect
// order endpoint started geocoding dropoffs too, and a second caller reaching
// for the raw helper would have had neither the cache nor the 1.1s spacing --
// on an endpoint that allows a 60-request burst per API key. Nominatim's
// policy is 1 req/sec per IP and it bans on abuse, and a ban lands on our
// egress IP, which would take storefront checkout down with it.
//
// Three guards, in order:
//   1. L1 in-memory LRU (24h TTL) -- a building only needs geocoding once a
//      day; "Strada X 12, Brașov" hashes the same whether 1 or 50 people type it
//   2. L2 `geocode_cache` table -- shared across Vercel instances, so the hit
//      ratio scales with traffic instead of resetting on every cold start
//   3. a global queue with 1.1s spacing -- respects OSM's hard policy no
//      matter how traffic is shaped
//
// Per-caller rate limiting stays with the caller: checkout limits per IP,
// Connect limits per API key. Those are different budgets and belong there.
//
// Single-instance for the queue -- replace with Redis when we outgrow one
// serverless function. The L2 table already carries across instances.

import { createHash } from 'node:crypto';
import { geocodeAddressRoVerbose, type GeocodeHit } from './nominatim';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export type GuardedGeocodeResult = {
  hit: GeocodeHit | null;
  cached: boolean;
  /** True when the caller's deadline passed while this sat in the queue. */
  expired?: boolean;
};

type CacheEntry = { lat: number; lng: number; displayName: string; expiresAt: number };

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5_000;

const cache = new Map<string, CacheEntry>();

function cacheKey(line1: string, city: string, postalCode: string, country: string): string {
  // Normalise — case + whitespace + diacritic-insensitive enough that
  // "Strada Mihai", "  strada mihai " and "STRADA MIHAI" collapse to one
  // cache row. NFKD strips combining marks (ă -> a, ț -> t), which we
  // want for cache keys (cache hits don't change query semantics; the
  // raw text is still sent to Nominatim verbatim).
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

async function persistentCacheGet(key: string): Promise<CacheEntry | null> {
  try {
    const admin = getSupabaseAdmin();
    // geocode_cache isn't in the generated Supabase types yet — same cast
    // pattern used elsewhere in this codebase for freshly-migrated tables.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (admin as any)
      .from('geocode_cache')
      .select('lat, lng, display_name, created_at')
      .eq('cache_key', key)
      .maybeSingle();
    if (!data) return null;
    const row = data as { lat: number; lng: number; display_name: string; created_at: string };
    const expiresAt = new Date(row.created_at).getTime() + CACHE_TTL_MS;
    if (expiresAt <= Date.now()) return null;
    return { lat: row.lat, lng: row.lng, displayName: row.display_name, expiresAt };
  } catch {
    // Cache is an optimization, never a hard dependency — a DB hiccup falls
    // straight through to a live Nominatim call.
    return null;
  }
}

async function persistentCacheSet(key: string, entry: CacheEntry): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('geocode_cache').upsert({
      cache_key: key,
      lat: entry.lat,
      lng: entry.lng,
      display_name: entry.displayName,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Best-effort — the L1 in-memory cache still has the value for this
    // instance's remaining lifetime even if the persistent write fails.
  }
}

// Global queue — guarantees we never burst above OSM's 1 req/sec hard
// policy even if every Vercel cold-start serves traffic simultaneously.
// A single instance can still parallelise multiple callers behind the same
// async event loop; the queue forces them to wait their turn. 1.1s spacing
// gives a small safety margin.
const MIN_INTERVAL_MS = 1_100;
let lastFetchAt = 0;
let queue: Promise<unknown> = Promise.resolve();

/** Returned instead of a result when `shouldSkip` says the work is obsolete. */
const SKIPPED = Symbol('skipped');

// `shouldSkip` is checked BEFORE the 1.1s wait, not only after. That is the
// whole point of it: a caller that has already given up must leave the queue
// immediately rather than hold a slot it cannot use. Without the early check,
// a burst of 60 abandoned lookups would still be spaced out one per 1.1s —
// about a minute of dead work sitting in front of the orders that come next,
// which would make them time out too, long after the burst ended.
//
// A skipped task also must not touch `lastFetchAt`: it never reached upstream,
// so it owes the provider nothing.
function serializeOsm<T>(
  fn: () => Promise<T>,
  shouldSkip?: () => boolean,
): Promise<T | typeof SKIPPED> {
  const next = queue.then(async () => {
    if (shouldSkip?.()) return SKIPPED;
    const wait = lastFetchAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    // Re-check: the deadline may well have passed during that wait.
    if (shouldSkip?.()) return SKIPPED;
    lastFetchAt = Date.now();
    return fn();
  });
  // The shared queue tail tracks completion (success or failure) so the
  // next caller is gated either way — but the returned promise must
  // surface the original error to *this* caller.
  queue = next.catch(() => undefined);
  return next;
}

/**
 * Geocode a Romanian address through the shared cache + upstream throttle.
 *
 * Returns `{ hit: null }` when Nominatim has no match, or
 * `{ hit: null, expired: true }` when `timeoutMs` elapsed before this call
 * reached the front of the queue. Throws only if the upstream call itself
 * throws; callers decide whether that is fatal.
 *
 * Pass `timeoutMs` when the caller cannot wait indefinitely — a request
 * serving a vendor's blocked checkout, for instance. It is what lets an
 * abandoned lookup release its queue slot instead of starving the ones
 * behind it. Cache hits are returned regardless, since they cost nothing.
 */
export async function geocodeGuarded(
  address: {
    line1: string;
    city: string;
    postalCode?: string;
    country?: string;
  },
  opts?: { timeoutMs?: number },
): Promise<GuardedGeocodeResult> {
  const line1 = address.line1;
  const city = address.city;
  const postalCode = address.postalCode ?? '';
  const country = address.country ?? 'Romania';

  const key = cacheKey(line1, city, postalCode, country);

  const l1 = cacheGet(key);
  if (l1) return { hit: { lat: l1.lat, lng: l1.lng, displayName: l1.displayName }, cached: true };

  const l2 = await persistentCacheGet(key);
  if (l2) {
    cacheSet(key, l2);
    return { hit: { lat: l2.lat, lng: l2.lng, displayName: l2.displayName }, cached: true };
  }

  const q = [line1, city, postalCode, country].filter((s) => s.trim().length > 0).join(', ');
  const deadline = opts?.timeoutMs === undefined ? undefined : Date.now() + opts.timeoutMs;
  const outcome = await serializeOsm(
    () => geocodeAddressRoVerbose(q),
    deadline === undefined ? undefined : () => Date.now() >= deadline,
  );
  if (outcome === SKIPPED) return { hit: null, cached: false, expired: true };
  const hit = outcome;
  if (!hit) return { hit: null, cached: false };

  const entry: CacheEntry = {
    lat: hit.lat,
    lng: hit.lng,
    displayName: hit.displayName,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  cacheSet(key, entry);
  await persistentCacheSet(key, entry);

  return { hit, cached: false };
}
