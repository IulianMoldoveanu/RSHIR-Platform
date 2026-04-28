import { createHash, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from './supabase/admin';

export type ApiKeyContext = {
  keyId: string;
  ownerUserId: string;
  scopes: string[];
  /** When set, requests are tagged as HIR_TENANT (orders posted by an HIR
   *  restaurant) instead of EXTERNAL_API (third-party clients). */
  hirTenantId: string | null;
};

export type ApiKeyResult =
  | { ok: true; ctx: ApiKeyContext }
  | { ok: false; status: number; error: string };

/** Hash with a stable algorithm so we can compare against `courier_api_keys.key_hash`. */
export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Pull `Authorization: Bearer <key>` and verify it against `courier_api_keys`. */
export async function authenticateApiKey(req: Request): Promise<ApiKeyResult> {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, status: 401, error: 'missing_bearer_token' };
  }
  const raw = match[1].trim();
  if (!raw) {
    return { ok: false, status: 401, error: 'missing_bearer_token' };
  }

  const hash = hashApiKey(raw);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('courier_api_keys')
    .select('id, owner_user_id, scopes, key_hash, is_active, hir_tenant_id')
    .eq('key_hash', hash)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: 'api_key_lookup_failed' };
  }
  if (!data || !data.is_active) {
    return { ok: false, status: 401, error: 'invalid_api_key' };
  }

  // Constant-time compare on the hex string just for defence-in-depth.
  const a = Buffer.from(data.key_hash, 'utf8');
  const b = Buffer.from(hash, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: 'invalid_api_key' };
  }

  // Best-effort touch of last_used_at; ignore failures.
  void admin
    .from('courier_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  return {
    ok: true,
    ctx: {
      keyId: data.id,
      ownerUserId: data.owner_user_id,
      scopes: Array.isArray(data.scopes) ? data.scopes : [],
      hirTenantId: data.hir_tenant_id ?? null,
    },
  };
}
