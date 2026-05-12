// Shared platform-admin allow-list guards.
//
// Single source of truth for the `HIR_PLATFORM_ADMIN_EMAILS` env var gate.
// Replaces ~12 near-duplicate implementations that lived in individual
// route handlers, server actions, and page components. Parsing rules
// (comma-split, trim, lowercase) are preserved unchanged.
//
// Three flavours, one per call-site shape we found in the codebase:
//
//   - requirePlatformAdmin()  — async; returns the explicit 401/403 status
//                               needed by API route handlers.
//   - getPlatformAdmin()      — async; returns the admin identity or `null`
//                               for server components / pages that just
//                               want a boolean-style branch.
//   - isPlatformAdminEmail()  — sync; checks an already-resolved email
//                               against the allow-list. Used by callers
//                               that already loaded `user` themselves.

import { createServerClient } from '@/lib/supabase/server';

/** Parse + normalize the allow-list once per call. */
function loadAllowList(): string[] {
  return (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Sync allow-list check for callers that already have a user email in hand.
 * Returns `false` for null/undefined/empty inputs.
 */
export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return loadAllowList().includes(email.toLowerCase());
}

export type RequirePlatformAdminResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * API-route guard. Resolves the current Supabase user via the server client,
 * then checks the email against `HIR_PLATFORM_ADMIN_EMAILS`.
 *
 *   - Unauthenticated (no user / no email)  → `{ ok: false, status: 401 }`
 *   - Authenticated but not on the allow-list → `{ ok: false, status: 403 }`
 *   - Authorized                             → `{ ok: true, userId, email }`
 *
 * The `error` strings are stable codes (`unauthorized` / `forbidden`) so
 * call sites can pass them straight into a JSON body. Callers that want
 * localized copy can ignore the field and translate themselves.
 */
export async function requirePlatformAdmin(): Promise<RequirePlatformAdminResult> {
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email) return { ok: false, status: 401, error: 'unauthorized' };
  if (!isPlatformAdminEmail(user.email)) {
    return { ok: false, status: 403, error: 'forbidden' };
  }
  return { ok: true, userId: user.id, email: user.email };
}

/**
 * Server-component-friendly variant. Returns the admin identity or `null`
 * when the caller is unauthenticated OR not on the allow-list (the two
 * states are indistinguishable at this layer — pages that need to redirect
 * the unauthenticated separately should call Supabase directly).
 */
export async function getPlatformAdmin(): Promise<{ userId: string; email: string } | null> {
  const result = await requirePlatformAdmin();
  if (!result.ok) return null;
  return { userId: result.userId, email: result.email };
}
