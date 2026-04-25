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
  const adminRaw = getSupabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<unknown>;
      };
    };
  };
  adminRaw
    .from('tenant_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .catch(() => {});

  return { tenantId: data.tenant_id, keyId: data.id, scopes: data.scopes };
}
