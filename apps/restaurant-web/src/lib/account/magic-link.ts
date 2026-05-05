import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@hir/supabase-types';

// Lane L PR 2 — magic-link mini-account helpers.
//
// Threat model:
//   * The raw token is only ever in the email body. We store SHA-256(token).
//     If the DB leaks, attacker still can't redeem because they need the
//     pre-image. (At a 32-byte random source, brute-forcing the hash is
//     infeasible.)
//   * Tokens are tenant-scoped: redeem requires (tenant_id, hash) match.
//   * Single-use: redeem flips used_at; a replayed click rejects.
//   * 24h TTL — enforced server-side at redeem time.
//   * /api/account/magic-link/request rate-limits 3/h per IP + 3/d per email.

export const MAGIC_LINK_TTL_MS = 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_PREFIX = 'hir-customer-session-';
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

export function sessionCookieName(tenantId: string): string {
  return `${SESSION_COOKIE_PREFIX}${tenantId}`;
}

/** Hex-encoded SHA-256. Stable on Node + on Edge (web crypto wraps). */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** 32 random bytes → 64 hex chars. */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export type IssueResult =
  | { ok: true; rawToken: string; expiresAt: Date }
  | { ok: false; reason: 'rate_limited' | 'persist_failed' };

/**
 * Issues a magic-link token for an existing customer (tenant + email
 * resolved upstream). The raw token is returned to the caller exactly once
 * for inclusion in the email; the DB only sees the hash.
 *
 * Per-customer rate limit: max 3 tokens/24h. The check is best-effort and
 * advisory — the IP-level limiter (route-level) is the hard cap.
 */
export async function issueMagicLink(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<Database> | any,
  args: { tenantId: string; customerId: string; ip: string | null },
): Promise<IssueResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (admin as any)
    .from('magic_link_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', args.customerId)
    .gte('created_at', since);
  if (typeof count === 'number' && count >= 3) {
    return { ok: false, reason: 'rate_limited' };
  }

  const raw = generateToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from('magic_link_tokens').insert({
    tenant_id: args.tenantId,
    customer_id: args.customerId,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
    ip: args.ip,
  });
  if (error) {
    console.error('[magic-link] insert failed', error.message);
    return { ok: false, reason: 'persist_failed' };
  }
  return { ok: true, rawToken: raw, expiresAt };
}

export type RedeemResult =
  | { ok: true; customerId: string; tenantId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'already_used' | 'tenant_mismatch' };

/**
 * Redeems a magic link. The token is hashed before lookup so the raw token
 * never hits the DB on the redeem path either. Atomic: marks used_at via a
 * conditional UPDATE so two concurrent redemptions can't both succeed.
 */
export async function redeemMagicLink(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<Database> | any,
  args: { tenantId: string; rawToken: string },
): Promise<RedeemResult> {
  if (!/^[a-f0-9]{64}$/i.test(args.rawToken)) {
    return { ok: false, reason: 'not_found' };
  }
  const tokenHash = hashToken(args.rawToken);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await (admin as any)
    .from('magic_link_tokens')
    .select('id, tenant_id, customer_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.tenant_id !== args.tenantId) return { ok: false, reason: 'tenant_mismatch' };
  if (row.used_at) return { ok: false, reason: 'already_used' };
  if (Date.parse(row.expires_at) < Date.now()) return { ok: false, reason: 'expired' };

  // Atomic claim — only flip used_at if it's still null. If two concurrent
  // redemptions race, exactly one will get rowCount=1.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: updErr } = await (admin as any)
    .from('magic_link_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('used_at', null)
    .select('id')
    .maybeSingle();
  if (updErr || !updated) {
    return { ok: false, reason: 'already_used' };
  }
  return { ok: true, customerId: row.customer_id, tenantId: row.tenant_id };
}
