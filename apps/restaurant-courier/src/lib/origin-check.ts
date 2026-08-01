import type { NextRequest } from 'next/server';

// Origin check — SameSite=Lax on its own is insufficient for state-mutating
// POSTs; an explicit Origin header comparison closes the gap.
//
// Allowed origins: comma-separated NEXT_PUBLIC_SITE_URL list.
// Fail-closed in production when the env var is missing.
function getAllowedOrigins(): Set<string> | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return null; // signals "deny all" in production, "allow all" in dev
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

export function checkOrigin(req: NextRequest): boolean {
  const allowed = getAllowedOrigins();
  if (!allowed) {
    // Env var absent: permit in dev, deny in production.
    return process.env.NODE_ENV !== 'production';
  }
  const origin = req.headers.get('origin') ?? '';
  return allowed.has(origin);
}
