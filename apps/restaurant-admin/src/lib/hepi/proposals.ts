// Hepi action proposals — stateless, HMAC-signed.
//
// When Hepi proposes an action (confirm mode), the server hands the client a
// SIGNED token describing exactly { actionId, params }. On confirmation the
// client sends the token back to /api/admin/hepi/execute, which re-verifies the
// signature before running anything. This means the client can NEVER forge a
// different action or tamper with params — it can only approve the precise
// proposal Hepi made. No DB table needed; the signature + short TTL is the
// integrity guarantee.
//
// Signing key: HEPI_ACTION_SECRET if set, else the service-role key (always
// present server-side). HMAC output never reveals the key.

import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_MS = 10 * 60 * 1000; // proposals expire after 10 minutes

export type ProposalPayload = {
  actionId: string;
  params: Record<string, unknown>;
  exp: number; // epoch ms
};

function secret(): string {
  const s = process.env.HEPI_ACTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(body: string): string {
  return b64url(createHmac('sha256', secret()).update(body).digest());
}

/** Produce a signed token for a proposed action. */
export function signProposal(actionId: string, params: Record<string, unknown>): string {
  const payload: ProposalPayload = { actionId, params, exp: Date.now() + TTL_MS };
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `${body}.${sign(body)}`;
}

/** Verify a token; returns the payload only if the signature + TTL are valid. */
export function verifyProposal(token: string): ProposalPayload | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;

  const expected = sign(body);
  // timingSafeEqual needs equal-length buffers; bail if not.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: ProposalPayload;
  try {
    payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload?.actionId !== 'string' || typeof payload?.exp !== 'number') return null;
  if (Date.now() > payload.exp) return null;
  return payload;
}
