import type { NextRequest } from 'next/server';

// Origin check — SameSite=Lax on its own is insufficient for state-mutating
// POSTs; an explicit Origin header comparison closes the gap.
//
// What the check is actually for is CSRF: a page on someone else's site must
// not be able to drive a courier's session. A request whose Origin equals the
// origin it was sent to is same-origin by definition, and no attacker page can
// forge that header — so the request's own origin is always allowed, and the
// env list is for *additional* hosts.
//
// It used to be the env list alone, which meant the guard depended on a value
// nobody re-checks after a domain is added. On production that value was still
// the *.vercel.app host while couriers were on curier.hirforyou.ro, so every
// transition queued while offline came back 403 and was dropped on reconnect —
// silently, in exactly the low-signal conditions the offline queue exists for.

/**
 * The origin this request was actually routed to.
 *
 * Read from the forwarded headers rather than `req.nextUrl.origin`, which
 * behind a proxy can report the internal address instead of the host the
 * courier's browser used — reintroducing the same silent mismatch through a
 * different door.
 */
function requestOrigin(req: NextRequest): string | null {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!host) return req.nextUrl.origin || null;
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? 'https';
  return `${proto}://${host}`;
}

function extraAllowedOrigins(): Set<string> | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return null;
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function checkOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin') ?? '';
  // No Origin header at all: not a browser cross-site POST, but also not
  // something we can vouch for. Permit in dev, deny in production — unchanged.
  if (!origin) return process.env.NODE_ENV !== 'production';

  // Same-origin is always fine, whatever host the app is being served on.
  if (origin === requestOrigin(req)) return true;

  const extra = extraAllowedOrigins();
  return extra ? extra.has(origin) : false;
}
