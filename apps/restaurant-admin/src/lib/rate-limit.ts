// RSHIR-20: in-memory token-bucket limiter.
// Single-instance only. Replace with Upstash Redis sliding-window before
// scaling beyond one Vercel function. Each route+key bucket lives in this
// process; sibling lambdas have their own counters and limits will not be
// shared.

import type { NextRequest } from 'next/server';

type Bucket = { tokens: number; lastRefill: number };

const buckets = new Map<string, Bucket>();

export type LimitOpts = {
  capacity: number;
  refillPerSec: number;
};

export type LimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function checkLimit(key: string, opts: LimitOpts): LimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  const bucket: Bucket = existing ?? { tokens: opts.capacity, lastRefill: now };

  if (existing) {
    const elapsedSec = (now - existing.lastRefill) / 1000;
    const refilled = Math.min(opts.capacity, existing.tokens + elapsedSec * opts.refillPerSec);
    bucket.tokens = refilled;
    bucket.lastRefill = now;
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
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  // Next 14: NextRequest.ip is populated on Vercel edge; in dev it is
  // undefined, so we fall back to a constant key — fine for local testing.
  const ip = (req as unknown as { ip?: string }).ip;
  return ip ?? '127.0.0.1';
}
