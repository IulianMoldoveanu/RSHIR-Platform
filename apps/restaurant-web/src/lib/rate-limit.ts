// RSHIR-31: in-memory token-bucket limiter for storefront state-changing
// routes (DSR endpoints, locale, future). Mirrors the admin app's helper
// at apps/restaurant-admin/src/lib/rate-limit.ts. Single-instance only —
// replace with Upstash before scaling beyond one Vercel function.

import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';

type Bucket = { tokens: number; capacity: number; lastRefill: number };

const buckets = new Map<string, Bucket>();

const MAX_BUCKETS = 10_000;
const IDLE_TTL_MS = 10 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 1000;
let lastPruneAt = 0;

export type LimitOpts = {
  capacity: number;
  refillPerSec: number;
};

export type LimitResult = { ok: true } | { ok: false; retryAfterSec: number };

function prune(now: number): void {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  for (const [k, b] of buckets) {
    if (b.tokens >= b.capacity && now - b.lastRefill >= IDLE_TTL_MS) {
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
  prune(now);

  const existing = buckets.get(key);
  const bucket: Bucket = existing ?? {
    tokens: opts.capacity,
    capacity: opts.capacity,
    lastRefill: now,
  };

  if (existing) {
    const elapsedSec = (now - existing.lastRefill) / 1000;
    const refilled = Math.min(existing.capacity, existing.tokens + elapsedSec * opts.refillPerSec);
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

  return `noip:${randomUUID()}`;
}
