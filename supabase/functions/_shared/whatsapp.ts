// Lane WHATSAPP-BUSINESS-API-SKELETON — pure helpers shared between the
// whatsapp-webhook Edge Function (Deno) and Node-side vitest tests.
//
// IMPORTANT: this file MUST stay free of Deno globals (Deno.env, Deno.serve)
// and Node globals (node:crypto). Use the Web Crypto API + TextEncoder
// only — both Node 22 and Deno 1.40+ support them natively.

// ────────────────────────────────────────────────────────────
// HMAC-SHA256 verification of Meta webhook bodies.
// Header format: "sha256=<hex>". Signature computed over the raw bytes
// of the request body using META_APP_SECRET as the HMAC key.
// Returns true iff signature matches; false otherwise (including when the
// header is missing or malformed). Constant-time compare on the hex
// strings (both fixed length 64) to keep timing-attack resistance.
// ────────────────────────────────────────────────────────────
export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = signatureHeader.slice('sha256='.length).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// ────────────────────────────────────────────────────────────
// Skeleton intent classifier. Sprint 15 routes through Master Orchestrator
// (master-orchestrator.ts) for trust gating + audit ledger. For now we
// only care about: connect-binding, the two read-only stubs Iulian asked
// to mirror from Telegram, and a help fallback.
// ────────────────────────────────────────────────────────────
export type SkeletonIntent =
  | 'connect'
  | 'orders_now'
  | 'sales_today'
  | 'help'
  | 'unknown';

export function classifySkeletonIntent(body: string): { intent: SkeletonIntent; nonce?: string } {
  const trimmed = body.trim();
  // Connect: "connect <nonce>" OR Telegram-style "/start connect_<nonce>"
  // (the latter shouldn't happen on WhatsApp, but is harmless to accept
  // in case Iulian copy-pastes a Telegram link by mistake).
  // CRITICAL: match against the original-case string. base64url nonces
  // are case-sensitive — lowercasing them breaks the redeem step.
  const m = trimmed.match(/^(?:\/start\s+connect_|connect\s+)([A-Za-z0-9_-]{16,})/i);
  if (m) return { intent: 'connect', nonce: m[1] };
  // For all the other (case-insensitive) checks we work on a lowercased
  // copy. The classifier reads keywords, not opaque tokens.
  const t = trimmed.toLowerCase();
  if (t.startsWith('/help') || t === 'ajutor' || t === 'help' || t === 'meniu') {
    return { intent: 'help' };
  }
  if (/(c[âa]te?\s+comenzi|^comenzi$|^orders$|^pending$)/.test(t)) {
    return { intent: 'orders_now' };
  }
  if (/(v[âa]nz[ăa]ri|incas[ăa]ri|^sales$|^revenue$|venit)/.test(t)) {
    return { intent: 'sales_today' };
  }
  return { intent: 'unknown' };
}

// ────────────────────────────────────────────────────────────
// GET handshake decision — pure helper used by the webhook + tests.
// Constant-time compare on the verify_token: token length is configurable
// per tenant in the Meta UI, so we pad/diff over the longer of the two.
// Returns the body to echo on success, or null on any mismatch (caller
// turns null into a 403). Never throws.
// ────────────────────────────────────────────────────────────
export function decideHandshake(
  mode: string | null,
  token: string | null,
  challenge: string | null,
  expected: string | undefined,
): string | null {
  if (mode !== 'subscribe') return null;
  if (!expected || !token) return null;
  // Constant-time string compare. Pad the shorter to the longer length so
  // we still mix in every byte; the length-mismatch is folded into diff so
  // we never short-circuit on length alone.
  const a = token;
  const b = expected;
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  if (diff !== 0) return null;
  return challenge ?? '';
}

// ────────────────────────────────────────────────────────────
// POST gating decision — pure helper that mirrors the webhook's early-exit
// ladder so vitest can cover it without a live Deno.serve loop.
// Order MUST match the webhook (feature flag → secrets → signature → JSON).
// ────────────────────────────────────────────────────────────
export type WebhookGateOutcome =
  | { status: 200; kind: 'accepted' }
  | { status: 400; kind: 'invalid_json' }
  | { status: 401; kind: 'invalid_signature' }
  | { status: 503; kind: 'disabled' | 'secrets_missing' };

export async function gatePostRequest(input: {
  enabled: boolean;
  appSecret: string | undefined;
  accessToken: string | undefined;
  phoneId: string | undefined;
  rawBody: string;
  signatureHeader: string | null;
}): Promise<WebhookGateOutcome> {
  if (!input.enabled) return { status: 503, kind: 'disabled' };
  if (!input.appSecret || !input.accessToken || !input.phoneId) {
    return { status: 503, kind: 'secrets_missing' };
  }
  const valid = await verifyMetaSignature(input.rawBody, input.signatureHeader, input.appSecret);
  if (!valid) return { status: 401, kind: 'invalid_signature' };
  try {
    JSON.parse(input.rawBody);
  } catch {
    return { status: 400, kind: 'invalid_json' };
  }
  return { status: 200, kind: 'accepted' };
}
