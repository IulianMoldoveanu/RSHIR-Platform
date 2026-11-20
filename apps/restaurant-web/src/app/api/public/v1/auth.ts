// RSHIR-52: Bearer token authenticator for the public API.
// Reads the Authorization header, sha256-hashes the raw token,
// looks it up in tenant_api_keys. Returns the tenantId + keyId on
// success, or null if the token is missing/invalid/inactive.
//
// Hash algorithm: sha256 (NOT bcrypt) — MVP spec says keep it simple.
// The raw token is never stored; only the hex digest is persisted.

import 'server-only';
import { createHash } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export type AuthedKey = {
  tenantId: string;
  keyId: string;
  scopes: string[];
};

export async function authenticateBearerKey(
  authHeader: string | null,
): Promise<AuthedKey | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const raw = authHeader.slice('Bearer '.length).trim();
  if (!raw) return null;

  const hash = createHash('sha256').update(raw).digest('hex');
  const admin = getSupabaseAdmin();

  // tenant_api_keys is not yet in the generated types; cast through unknown.
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: boolean) => {
            maybeSingle: () => Promise<{
              data: { id: string; tenant_id: string; scopes: string[] } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };

  const { data, error } = await sb
    .from('tenant_api_keys')
    .select('id, tenant_id, scopes')
    .eq('key_hash', hash)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;

  // Best-effort: update last_used_at without blocking the response.
  //
  // This used to end in `.catch(() => {})` and that single call took the
  // whole public API down for every valid key. A postgrest query builder is
  // a *thenable*, not a Promise: it implements `then()` and nothing else, so
  // `.catch` is undefined and calling it throws a TypeError right here —
  // after the key has been found, before this function can return. Every
  // authenticated request answered 500 with an empty body; an unauthenticated
  // one returned a clean 401, because it never reached this line.
  //
  // Nothing caught it in review or in CI: the cast below declared `eq` as
  // returning a Promise, which is a lie the compiler cannot see through, and
  // every route test mocks `authenticateBearerKey` itself, so this file had
  // no coverage at all. The type now says `PromiseLike`, which is what it
  // really is — `.catch` on it no longer compiles.
  const adminRaw = getSupabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => PromiseLike<unknown>;
      };
    };
  };
  void adminRaw
    .from('tenant_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(
      () => {},
      () => {},
    );

  return { tenantId: data.tenant_id, keyId: data.id, scopes: data.scopes };
}
