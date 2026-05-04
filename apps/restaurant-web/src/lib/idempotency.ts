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

  // Same key + same body -> cache hit.
  const { data: hit } = await admin
    .from('idempotency_keys')
    .select('response, status_code, created_at')
    .eq('tenant_id', tenantId)
    .eq('idempotency_key', key)
    .eq('request_hash', requestHash)
    .gte('created_at', cutoff)
    .maybeSingle();

  if (hit) {
    return {
      kind: 'CACHED',
      response: NextResponse.json(hit.response, { status: hit.status_code, headers: { 'Idempotency-Replay': 'true' } }),
    };
  }

  // Same key + different body -> mismatch.
  const { data: keyExists } = await admin
    .from('idempotency_keys')
    .select('request_hash')
    .eq('tenant_id', tenantId)
    .eq('idempotency_key', key)
    .gte('created_at', cutoff)
    .limit(1)
    .maybeSingle();

  if (keyExists && keyExists.request_hash !== requestHash) {
    return {
      kind: 'MISMATCH',
      response: NextResponse.json(
        { error: 'idempotency_mismatch', detail: 'same key reused with different request body' },
        { status: 422 },
      ),
    };
  }

  return { kind: 'NEW', key, requestHash };
}

export async function storeIdempotency(
  admin: SupabaseClient,
  tenantId: string,
  key: string,
  requestHash: string,
  response: unknown,
  statusCode: number,
): Promise<void> {
  await admin.from('idempotency_keys').insert({
    tenant_id: tenantId,
    idempotency_key: key,
    request_hash: requestHash,
    response: response as never,
    status_code: statusCode,
  });
}

// Helper for callers that want to generate a random key client-side without
// importing crypto themselves. Only used in tests; real clients pick their own.
export function generateIdempotencyKey(): string {
  return randomUUID();
}
