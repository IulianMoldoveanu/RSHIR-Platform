// RSHIR-20: in-memory token-bucket limiter.
// Single-instance only. Replace with Upstash Redis sliding-window before
// scaling beyond one Vercel function. Each route+key bucket lives in this
// process; sibling lambdas have their own counters and limits will not be
// shared.
//
// RSHIR-22: bounded growth — cap the Map at MAX_BUCKETS and lazily prune
// idle full buckets. Prevents an attacker rotating IPs from exhausting
// memory in the function instance.
//
// RSHIR-26 M-2: every bucket now stores its own capacity, so prune() and
// the LRU eviction path do not depend on the caller's `opts.capacity`.
// RSHIR-26 M-1: clientIp() no longer collapses every IP-less request to
// `127.0.0.1` — that path used to share one bucket across all anonymous
// callers, letting a single client exhaust the limit for everyone. The
// fallback now returns a fresh per-call key (effectively no per-IP cap
// in dev / on misconfigured proxies, but no shared collision either).

import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';

type Bucket = { tokens: number; capacity: number; lastRefill: number };

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

  // No reliable client IP. Returning a fresh per-call key gives this
  // request its own bucket (no rate limiting in effect, but no shared
  // collision either). On Vercel `req.ip` is always populated; this
  // branch only runs in local dev or on a misconfigured non-Vercel host.
  return `noip:${randomUUID()}`;
}
