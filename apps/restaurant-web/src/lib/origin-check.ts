// RSHIR-26: same-origin check for state-changing storefront API routes.
// Ported from restaurant-admin/src/lib/origin-check.ts so /api/locale and
// any future POST/PATCH/DELETE on the storefront cannot be triggered
// cross-origin via a victim's browser.
//
// Lane POLISH-RO 2026-05-10 — also accept the request's own host as a
// trusted origin so the check works even when ALLOWED_ORIGINS is unset
// in production (the prior behaviour silently 403'd /api/locale, which
// broke the language toggle on hirforyou.ro). Same-origin requests are
// safe by definition: a malicious page on a different origin cannot
// forge an `Origin` / `Referer` that matches the target Host header.

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

function selfOrigin(req: NextRequest): string | null {
  const host = req.headers.get('host');
  if (!host) return null;
  // Forwarded protocol takes priority on Vercel (always https in prod).
  const xfProto = req.headers.get('x-forwarded-proto');
  const proto = xfProto?.split(',')[0]?.trim() || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export function assertSameOrigin(req: NextRequest): OriginCheck {
  const allowed = readAllowed();
  const self = selfOrigin(req);

  const origin = req.headers.get('origin');
  const candidate = origin ?? originFromReferer(req.headers.get('referer'));
  if (!candidate) {
    return { ok: false, reason: 'origin_missing' };
  }

  // Primary check: explicit allow-list from env.
  if (allowed.includes(candidate)) {
    return { ok: true };
  }

  // Fallback: candidate matches the request's own host. This is the
  // same-origin case — the browser will only send a same-origin Origin
  // header for fetches initiated by the same page. A different-origin
  // page cannot forge this header (CORS forbids reading or setting it).
  if (self && candidate === self) {
    return { ok: true };
  }

  if (allowed.length === 0) {
    return { ok: false, reason: 'origin_not_self' };
  }
  return { ok: false, reason: 'origin_not_allowed' };
}
