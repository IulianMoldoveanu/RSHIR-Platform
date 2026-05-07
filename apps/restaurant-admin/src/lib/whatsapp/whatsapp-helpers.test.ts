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
