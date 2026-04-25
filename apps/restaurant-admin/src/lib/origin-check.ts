// RSHIR-20: same-origin check helper for state-changing API routes.
// Browsers always send `Origin` on cross-site fetch + on POST; if it is
// missing we fall back to parsing `Referer`. If both are missing we reject.

import type { NextRequest } from 'next/server';

export type OriginCheck = { ok: true } | { ok: false; reason: string };

function readAllowed(): string[] {
  const raw = process.env.ALLOWED_ORIGINS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function originFromReferer(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export function assertSameOrigin(req: NextRequest): OriginCheck {
  const allowed = readAllowed();
  if (allowed.length === 0) {
    // Misconfiguration: refuse rather than silently allow everything.
    return { ok: false, reason: 'allowed_origins_unset' };
  }

  const origin = req.headers.get('origin');
  const candidate = origin ?? originFromReferer(req.headers.get('referer'));
  if (!candidate) {
    return { ok: false, reason: 'origin_missing' };
  }

  if (!allowed.includes(candidate)) {
    return { ok: false, reason: 'origin_not_allowed' };
  }

  return { ok: true };
}
