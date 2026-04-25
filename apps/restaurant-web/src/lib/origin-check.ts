// RSHIR-26: same-origin check for state-changing storefront API routes.
// Ported from restaurant-admin/src/lib/origin-check.ts so /api/locale and
// any future POST/PATCH/DELETE on the storefront cannot be triggered
// cross-origin via a victim's browser.

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
