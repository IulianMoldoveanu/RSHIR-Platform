// Tests for the WhatsApp Business webhook pure helpers
// (HMAC-SHA256 verification + skeleton intent classifier).
//
// The canonical implementations live in
// `supabase/functions/_shared/whatsapp.ts` (Deno-first; pure Web-Crypto +
// TextEncoder so Node loads them too).

import { createHmac } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import {
  verifyMetaSignature,
  classifySkeletonIntent,
  decideHandshake,
  gatePostRequest,
} from '../../../../../supabase/functions/_shared/whatsapp';

const SECRET = 'test_app_secret_meta_dummy_value';

function sign(body: string, secret = SECRET): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyMetaSignature', () => {
  test('accepts a valid signature for a JSON body', async () => {
    const body = '{"object":"whatsapp_business_account","entry":[{"id":"123"}]}';
    const sig = sign(body);
    expect(await verifyMetaSignature(body, sig, SECRET)).toBe(true);
  });

  test('rejects when the body is mutated by a single byte', async () => {
    const body = '{"object":"whatsapp_business_account"}';
    const sig = sign(body);
    expect(await verifyMetaSignature(body + ' ', sig, SECRET)).toBe(false);
  });

  test('rejects when the secret differs', async () => {
    const body = 'hello world';
    const sig = sign(body, 'other_secret');
    expect(await verifyMetaSignature(body, sig, SECRET)).toBe(false);
  });

  test('rejects a missing or null header', async () => {
    expect(await verifyMetaSignature('any', null, SECRET)).toBe(false);
    expect(await verifyMetaSignature('any', '', SECRET)).toBe(false);
  });

  test('rejects a header without the sha256= prefix', async () => {
    const body = 'x';
    const hex = createHmac('sha256', SECRET).update(body).digest('hex');
    expect(await verifyMetaSignature(body, hex, SECRET)).toBe(false);
  });

  test('rejects a non-hex signature payload', async () => {
    expect(await verifyMetaSignature('x', 'sha256=NOT_HEX_VALUE_HERE', SECRET)).toBe(false);
  });

  test('rejects a signature of wrong length', async () => {
    expect(await verifyMetaSignature('x', 'sha256=abcd', SECRET)).toBe(false);
  });

  test('handles unicode bodies (UTF-8 encoding parity)', async () => {
    // Common case: RO diacritics in a customer reply.
    const body = '{"text":"Salutări — câte comenzi?"}';
    const sig = sign(body);
    expect(await verifyMetaSignature(body, sig, SECRET)).toBe(true);
  });
});

describe('classifySkeletonIntent', () => {
  test('classifies "connect <nonce>" with a 32-byte base64url nonce', () => {
    const nonce = 'AbCdEf0123456789-_AbCdEf0123456789AbCdEf0123';
    expect(classifySkeletonIntent(`connect ${nonce}`)).toEqual({ intent: 'connect', nonce });
  });

  test('also accepts the Telegram-style "/start connect_<nonce>" fallback', () => {
    const nonce = 'AbCdEf0123456789-_AbCdEf0123';
    expect(classifySkeletonIntent(`/start connect_${nonce}`)).toEqual({ intent: 'connect', nonce });
  });

  test('rejects too-short nonces (< 16 chars)', () => {
    expect(classifySkeletonIntent('connect short')).toEqual({ intent: 'unknown' });
  });

  test('classifies RO orders_now phrasings', () => {
    expect(classifySkeletonIntent('câte comenzi am')).toEqual({ intent: 'orders_now' });
    expect(classifySkeletonIntent('cate comenzi')).toEqual({ intent: 'orders_now' });
    expect(classifySkeletonIntent('comenzi')).toEqual({ intent: 'orders_now' });
    expect(classifySkeletonIntent('orders')).toEqual({ intent: 'orders_now' });
  });

  test('classifies RO sales_today phrasings', () => {
    expect(classifySkeletonIntent('vânzări azi')).toEqual({ intent: 'sales_today' });
    expect(classifySkeletonIntent('vanzari')).toEqual({ intent: 'sales_today' });
    expect(classifySkeletonIntent('incasari')).toEqual({ intent: 'sales_today' });
    expect(classifySkeletonIntent('sales')).toEqual({ intent: 'sales_today' });
    expect(classifySkeletonIntent('venit total')).toEqual({ intent: 'sales_today' });
  });

  test('classifies help', () => {
    expect(classifySkeletonIntent('/help')).toEqual({ intent: 'help' });
    expect(classifySkeletonIntent('ajutor')).toEqual({ intent: 'help' });
    expect(classifySkeletonIntent('meniu')).toEqual({ intent: 'help' });
  });

  test('returns unknown for free-text', () => {
    expect(classifySkeletonIntent('salut, ce mai faci?')).toEqual({ intent: 'unknown' });
    expect(classifySkeletonIntent('')).toEqual({ intent: 'unknown' });
  });

  test('is case + whitespace tolerant', () => {
    expect(classifySkeletonIntent('  COMENZI  ').intent).toBe('orders_now');
    expect(classifySkeletonIntent('Ajutor').intent).toBe('help');
  });
});

describe('decideHandshake (GET verification)', () => {
  const TOKEN = 'meta-verify-token-xyz-1234567890';

  test('echoes the challenge on valid handshake', () => {
    expect(decideHandshake('subscribe', TOKEN, 'challenge-abc', TOKEN)).toBe('challenge-abc');
  });

  test('returns empty string when challenge omitted but otherwise valid', () => {
    expect(decideHandshake('subscribe', TOKEN, null, TOKEN)).toBe('');
  });

  test('rejects when mode is not subscribe', () => {
    expect(decideHandshake('unsubscribe', TOKEN, 'c', TOKEN)).toBeNull();
    expect(decideHandshake(null, TOKEN, 'c', TOKEN)).toBeNull();
  });

  test('rejects when token mismatches', () => {
    expect(decideHandshake('subscribe', 'wrong', 'c', TOKEN)).toBeNull();
  });

  test('rejects when expected token is unset (function not configured)', () => {
    expect(decideHandshake('subscribe', TOKEN, 'c', undefined)).toBeNull();
    expect(decideHandshake('subscribe', TOKEN, 'c', '')).toBeNull();
  });

  test('rejects when token has the wrong length (length is mixed into diff)', () => {
    expect(decideHandshake('subscribe', TOKEN + 'x', 'c', TOKEN)).toBeNull();
    expect(decideHandshake('subscribe', TOKEN.slice(0, -1), 'c', TOKEN)).toBeNull();
  });
});

describe('gatePostRequest (POST gating ladder)', () => {
  const APP_SECRET = 'test_app_secret_meta_dummy_value';
  const ACCESS = 'EAAtoken';
  const PHONE = '1234567890';
  const BODY = '{"object":"whatsapp_business_account","entry":[]}';
  const SIG = 'sha256=' + createHmac('sha256', APP_SECRET).update(BODY).digest('hex');

  test('returns 503 disabled when WHATSAPP_ENABLED is not true', async () => {
    const r = await gatePostRequest({
      enabled: false,
      appSecret: APP_SECRET,
      accessToken: ACCESS,
      phoneId: PHONE,
      rawBody: BODY,
      signatureHeader: SIG,
    });
    expect(r).toEqual({ status: 503, kind: 'disabled' });
  });

  test('returns 503 secrets_missing when any of the 3 secrets is unset', async () => {
    const base = { enabled: true, rawBody: BODY, signatureHeader: SIG };
    expect(await gatePostRequest({ ...base, appSecret: undefined, accessToken: ACCESS, phoneId: PHONE })).toEqual({ status: 503, kind: 'secrets_missing' });
    expect(await gatePostRequest({ ...base, appSecret: APP_SECRET, accessToken: undefined, phoneId: PHONE })).toEqual({ status: 503, kind: 'secrets_missing' });
    expect(await gatePostRequest({ ...base, appSecret: APP_SECRET, accessToken: ACCESS, phoneId: undefined })).toEqual({ status: 503, kind: 'secrets_missing' });
  });

  test('returns 401 invalid_signature when X-Hub-Signature-256 is missing', async () => {
    const r = await gatePostRequest({
      enabled: true,
      appSecret: APP_SECRET,
      accessToken: ACCESS,
      phoneId: PHONE,
      rawBody: BODY,
      signatureHeader: null,
    });
    expect(r).toEqual({ status: 401, kind: 'invalid_signature' });
  });

  test('returns 401 invalid_signature when signature does not match', async () => {
    const r = await gatePostRequest({
      enabled: true,
      appSecret: APP_SECRET,
      accessToken: ACCESS,
      phoneId: PHONE,
      rawBody: BODY,
      signatureHeader: 'sha256=' + 'a'.repeat(64),
    });
    expect(r).toEqual({ status: 401, kind: 'invalid_signature' });
  });

  test('returns 400 invalid_json when body is signed correctly but malformed', async () => {
    const malformed = 'not-json{';
    const sig = 'sha256=' + createHmac('sha256', APP_SECRET).update(malformed).digest('hex');
    const r = await gatePostRequest({
      enabled: true,
      appSecret: APP_SECRET,
      accessToken: ACCESS,
      phoneId: PHONE,
      rawBody: malformed,
      signatureHeader: sig,
    });
    expect(r).toEqual({ status: 400, kind: 'invalid_json' });
  });

  test('returns 200 accepted on a valid signed JSON body', async () => {
    const r = await gatePostRequest({
      enabled: true,
      appSecret: APP_SECRET,
      accessToken: ACCESS,
      phoneId: PHONE,
      rawBody: BODY,
      signatureHeader: SIG,
    });
    expect(r).toEqual({ status: 200, kind: 'accepted' });
  });

  test('gate order: disabled is checked before signature (Meta retries instead of authing)', async () => {
    // Bad signature but disabled → MUST report disabled, not invalid_signature.
    const r = await gatePostRequest({
      enabled: false,
      appSecret: APP_SECRET,
      accessToken: ACCESS,
      phoneId: PHONE,
      rawBody: BODY,
      signatureHeader: 'sha256=' + 'b'.repeat(64),
    });
    expect(r.kind).toBe('disabled');
  });
});
