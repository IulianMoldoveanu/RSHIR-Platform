import 'server-only';

/**
 * Minimal in-memory fixed-window rate limiter for unauthenticated routes.
 *
 * Scoped per process — adequate for low-volume endpoints like the display
 * PIN gate where the goal is to blunt brute-force, not to enforce a global
 * quota. On a multi-instance deployment each instance keeps its own window;
 * that is acceptable for this threat model (slows guessing dramatically) and
 * avoids a Redis dependency.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number): void {
  // Cheap opportunistic GC: at most once per 60s, drop expired buckets so the
  // Map doesn't grow unbounded under churn of distinct keys (e.g. many IPs).
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets — use for the Retry-After header. */
  retryAfter: number;
};

/**
 * Record one hit for `key` and report whether it is within `limit` per
 * `windowMs`. Call once per request, before the expensive work.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { allowed: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

/**
 * Best-effort client IP from standard proxy headers (Vercel sets
 * x-forwarded-for). Falls back to a constant so the limiter still works
 * (shared bucket) when no IP is available.
 */
export function clientIpFrom(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}
