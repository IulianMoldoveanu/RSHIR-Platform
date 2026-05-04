// RSHIR-A3 — Idempotency-Key middleware for /api/checkout/intent.
//
// Contract:
//   Header: `Idempotency-Key: <client-generated-uuid>`
//   Window: 24h cache.
//   Replay rule: same key + same request body hash -> cached response.
//                same key + DIFFERENT body hash    -> 422 idempotency_mismatch.
//
// Why hash the body too: a retried request that mutates the cart but reuses
// the key by mistake should NOT silently return the old response. We surface
// it as a client error so the caller picks a fresh key.

import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const KEY_HEADER = 'Idempotency-Key';
const MIN_KEY_LEN = 8;
const MAX_KEY_LEN = 200;
const TTL_HOURS = 24;

export type IdempotencyHit =
  | { kind: 'NEW'; key: string; requestHash: string }
  | { kind: 'CACHED'; response: NextResponse }
  | { kind: 'MISMATCH'; response: NextResponse }
  | { kind: 'INVALID'; response: NextResponse }
  | { kind: 'IN_FLIGHT'; response: NextResponse }
  | { kind: 'NONE' };

export function readIdempotencyKey(req: Request): string | null {
  const v = req.headers.get(KEY_HEADER) ?? req.headers.get(KEY_HEADER.toLowerCase());
  return v && v.trim().length > 0 ? v.trim() : null;
}

export function isValidKey(key: string): boolean {
  if (key.length < MIN_KEY_LEN || key.length > MAX_KEY_LEN) return false;
  return /^[A-Za-z0-9_\-:.]+$/.test(key);
}

export function hashRequestBody(rawBody: string): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

// Atomic reserve-or-replay. Replaces the original two-phase
// (checkIdempotency + storeIdempotency at end) with a TOCTOU-safe pattern:
//
//   1. Validate key format.
//   2. Detect MISMATCH (same key + different body hash within TTL).
//   3. Atomically INSERT a placeholder row { status_code: 0 }.
//      - If insert succeeds -> we own this key, return NEW.
//      - If PK conflict -> another request beat us. Reload the existing row:
//          - status_code = 0 -> still in-flight; return 409 IN_FLIGHT.
//          - status_code != 0 -> completed; return CACHED with stored response.
//
// Without the placeholder INSERT, two concurrent identical requests would
// both pass the cache check and both create new orders + Stripe intents
// (the previous design's bug).
export async function checkIdempotency(
  admin: SupabaseClient,
  tenantId: string,
  key: string,
  requestHash: string,
): Promise<IdempotencyHit> {
  if (!isValidKey(key)) {
    return {
      kind: 'INVALID',
      response: NextResponse.json(
        { error: 'idempotency_invalid_key', detail: `Idempotency-Key must be ${MIN_KEY_LEN}-${MAX_KEY_LEN} chars [A-Za-z0-9_\\-:.]` },
        { status: 400 },
      ),
    };
  }

  const cutoff = new Date(Date.now() - TTL_HOURS * 3600 * 1000).toISOString();

  // 1. MISMATCH gate: same key + different hash within TTL.
  const { data: keyExists } = await admin
    .from('idempotency_keys')
    .select('request_hash')
    .eq('tenant_id', tenantId)
    .eq('idempotency_key', key)
    .gte('created_at', cutoff)
    .limit(1)
    .maybeSingle();

  if (keyExists && (keyExists as { request_hash?: string }).request_hash !== requestHash) {
    return {
      kind: 'MISMATCH',
      response: NextResponse.json(
        { error: 'idempotency_mismatch', detail: 'same key reused with different request body' },
        { status: 422 },
      ),
    };
  }

  // 2. Atomic reserve. PK is (tenant_id, idempotency_key, request_hash).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insErr } = await (admin as any)
    .from('idempotency_keys')
    .insert({
      tenant_id: tenantId,
      idempotency_key: key,
      request_hash: requestHash,
      response: {},
      status_code: 0,
    });

  if (!insErr) {
    return { kind: 'NEW', key, requestHash };
  }

  // 3. Conflict (PK violation). Reload to see what the other request did.
  const { data: existing } = await admin
    .from('idempotency_keys')
    .select('response, status_code')
    .eq('tenant_id', tenantId)
    .eq('idempotency_key', key)
    .eq('request_hash', requestHash)
    .gte('created_at', cutoff)
    .maybeSingle();

  if (!existing) {
    // Race lost the insert but row not found on reload? Unlikely (TTL filter
    // could mask a row inserted exactly at cutoff). Treat as NEW; worst case
    // is we'll fail again on storeIdempotency UPDATE which is harmless.
    return { kind: 'NEW', key, requestHash };
  }

  const ex = existing as { response: unknown; status_code: number };
  if (ex.status_code === 0) {
    // Other request still working — tell the caller to retry shortly.
    return {
      kind: 'IN_FLIGHT',
      response: NextResponse.json(
        { error: 'idempotency_in_flight', detail: 'duplicate request still being processed; retry in ~1s' },
        { status: 409, headers: { 'Retry-After': '1' } },
      ),
    };
  }

  // Other request finished. Replay its response.
  return {
    kind: 'CACHED',
    response: NextResponse.json(ex.response, {
      status: ex.status_code,
      headers: { 'Idempotency-Replay': 'true' },
    }),
  };
}

// Update the placeholder row created in checkIdempotency with the real
// response + status code. UPDATE (not INSERT) because the row already exists.
export async function storeIdempotency(
  admin: SupabaseClient,
  tenantId: string,
  key: string,
  requestHash: string,
  response: unknown,
  statusCode: number,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('idempotency_keys')
    .update({
      response: response as never,
      status_code: statusCode,
    })
    .eq('tenant_id', tenantId)
    .eq('idempotency_key', key)
    .eq('request_hash', requestHash);
}

// Helper for callers that want to generate a random key client-side without
// importing crypto themselves. Only used in tests; real clients pick their own.
export function generateIdempotencyKey(): string {
  return randomUUID();
}
