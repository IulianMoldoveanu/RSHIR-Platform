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
