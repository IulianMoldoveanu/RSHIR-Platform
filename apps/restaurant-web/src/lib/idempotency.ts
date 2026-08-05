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
// A lock row (response IS NULL) older than this is treated as abandoned —
// the request that created it crashed or errored out on a path that never
// reached storeIdempotency(). 30s is generous for a checkout request
// (well beyond any real PSP round-trip) while still letting a genuinely
// stuck key recover within the same customer session, not the full 24h TTL.
const LOCK_STALE_MS = 30_000;

export type IdempotencyHit =
  | { kind: 'NEW'; key: string; requestHash: string }
  | { kind: 'CACHED'; response: NextResponse }
  | { kind: 'MISMATCH'; response: NextResponse }
  | { kind: 'INVALID'; response: NextResponse }
  | { kind: 'LOCKED'; response: NextResponse }
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
    .not('response', 'is', null)
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

  // Atomic lock: the unique index on (tenant_id, idempotency_key) — not
  // request_hash — is what makes this a real lock. Two concurrent requests
  // with the identical key+hash both pass the SELECTs above (neither has
  // written yet); only one of them can win this INSERT. response/
  // status_code start NULL (schema allows it — 20260727_012) and are
  // filled in by storeIdempotency() once the real response is known.
  //
  // security audit finding 2026-07-27: previously the row was only
  // written at the very end of the request (storeIdempotency), so a
  // retried/double-tapped request with the same key could create two
  // separate orders + PSP sessions before either write landed. This lock
  // closes that window — the loser gets 'LOCKED' before touching any
  // order/PSP logic.
  const { error: lockErr } = await admin.from('idempotency_keys').insert({
    tenant_id: tenantId,
    idempotency_key: key,
    request_hash: requestHash,
  } as never);

  if (lockErr) {
    // Unique violation = another request already holds this key. If that
    // row is a stale abandoned lock (response still NULL past
    // LOCK_STALE_MS — the holder errored out on a path that never called
    // storeIdempotency, or the process crashed), reclaim it instead of
    // wedging this key for the rest of the 24h TTL. Scoped to response IS
    // NULL so a genuinely completed order is never touched.
    const staleCutoff = new Date(Date.now() - LOCK_STALE_MS).toISOString();
    const { data: reclaimed } = await admin
      .from('idempotency_keys')
      .update({ request_hash: requestHash, created_at: new Date().toISOString() } as never)
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', key)
      .is('response', null)
      .lt('created_at', staleCutoff)
      .select('idempotency_key')
      .maybeSingle();

    if (reclaimed) {
      return { kind: 'NEW', key, requestHash };
    }

    return {
      kind: 'LOCKED',
      response: NextResponse.json(
        { error: 'idempotency_in_progress', detail: 'a request with this key is already being processed' },
        { status: 409, headers: { 'Retry-After': '2' } },
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
  // The row already exists — checkIdempotency's lock INSERT created it
  // (with response/status_code NULL) before any order/PSP work started.
  // This fills in the real outcome so a later replay hits the CACHED path.
  await admin
    .from('idempotency_keys')
    .update({ response: response as never, status_code: statusCode })
    .eq('tenant_id', tenantId)
    .eq('idempotency_key', key)
    .eq('request_hash', requestHash);
}

// Helper for callers that want to generate a random key client-side without
// importing crypto themselves. Only used in tests; real clients pick their own.
export function generateIdempotencyKey(): string {
  return randomUUID();
}
