// RSHIR-20: in-memory token-bucket limiter.
// Single-instance only. Replace with Upstash Redis sliding-window before
// scaling beyond one Vercel function. Each route+key bucket lives in this
// process; sibling lambdas have their own counters and limits will not be
// shared.
//
// RSHIR-22: bounded growth — cap the Map at MAX_BUCKETS and lazily prune
// idle full buckets. Prevents an attacker rotating IPs from exhausting
// memory in the function instance.

import type { NextRequest } from 'next/server';

type Bucket = { tokens: number; lastRefill: number };

const buckets = new Map<string, Bucket>();

const MAX_BUCKETS = 10_000;
const IDLE_TTL_MS = 10 * 60 * 1000; // 10 min full-bucket idle window
const PRUNE_INTERVAL_MS = 60 * 1000;
let lastPruneAt = 0;

export type LimitOpts = {
  capacity: number;
  refillPerSec: number;
};

export type LimitResult = { ok: true } | { ok: false; retryAfterSec: number };

function prune(now: number, capacityForKey: (k: string) => number | null): void {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  for (const [k, b] of buckets) {
    const cap = capacityForKey(k);
    if (cap == null) continue;
    if (b.tokens >= cap && now - b.lastRefill >= IDLE_TTL_MS) {
      buckets.delete(k);
    }
  }
}

function evictOldestIfFull(): void {
  if (buckets.size < MAX_BUCKETS) return;
  let oldestKey: string | null = null;
  let oldestAt = Infinity;
  for (const [k, b] of buckets) {
    if (b.lastRefill < oldestAt) {
      oldestAt = b.lastRefill;
      oldestKey = k;
    }
  }
  if (oldestKey !== null) buckets.delete(oldestKey);
}

export function checkLimit(key: string, opts: LimitOpts): LimitResult {
  const now = Date.now();

  // Pruning only knows the bucket's capacity for buckets we are
  // currently visiting via checkLimit, so we treat any bucket whose
  // tokens are >= capacityForKey-of-the-current-call as a candidate.
  // This is a safe over-approximation: a bucket using a different
  // capacity that happens to be >= opts.capacity is still effectively
  // idle, and clearing it just forces re-init on next hit.
  prune(now, () => opts.capacity);

  const existing = buckets.get(key);
  const bucket: Bucket = existing ?? { tokens: opts.capacity, lastRefill: now };

  if (existing) {
    const elapsedSec = (now - existing.lastRefill) / 1000;
    const refilled = Math.min(opts.capacity, existing.tokens + elapsedSec * opts.refillPerSec);
    bucket.tokens = refilled;
    bucket.lastRefill = now;
  } else {
    evictOldestIfFull();
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    return { ok: true };
  }

  buckets.set(key, bucket);
  const deficit = 1 - bucket.tokens;
  const retryAfterSec = Math.max(1, Math.ceil(deficit / opts.refillPerSec));
  return { ok: false, retryAfterSec };
}

// RSHIR-22: prefer NextRequest.ip (Vercel-populated, untamperable) and
// only fall back to x-forwarded-for when explicitly trusted via env.
// Trusting XFF blindly let a caller set their own IP and bypass per-IP
// limits.
export function clientIp(req: NextRequest): string {
  const ip = (req as unknown as { ip?: string }).ip;
  if (ip) return ip;

  if (process.env.TRUST_PROXY === '1') {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) {
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
    const real = req.headers.get('x-real-ip');
    if (real) return real;
  }

  // Local dev / non-Vercel host: constant key is fine for testing.
  return '127.0.0.1';
}
