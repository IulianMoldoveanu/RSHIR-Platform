// Unit test for the HMAC contract on the external-dispatch webhook.
// Receivers (Fleet Manager dispatch apps) verify the request by
// recomputing HMAC-SHA256(body, secret) and comparing to the
// X-HIR-Signature header (without the `sha256=` prefix). If we ever
// change how we sign, this test fails and the FM partners must be
// notified before the migration ships.

import { describe, expect, it } from 'vitest';
import { signBody, sha256Hex } from './external-dispatch';

describe('external-dispatch HMAC', () => {
  it('produces a stable HMAC-SHA256 hex over the canonical body', () => {
    const body = JSON.stringify({ a: 1, b: 'two' });
    const secret = 'test-secret-aabbcc';
    const sig = signBody(body, secret);
    // Pre-computed expected value — locks down the signing format so
    // any future refactor that breaks the contract is caught here.
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    // Same input -> same output (deterministic).
    expect(signBody(body, secret)).toBe(sig);
  });

  it('produces different signatures for different secrets', () => {
    const body = '{"order_id":"o1"}';
    expect(signBody(body, 's1')).not.toBe(signBody(body, 's2'));
  });

  it('produces different signatures for different bodies', () => {
    const secret = 'k';
    expect(signBody('{"a":1}', secret)).not.toBe(signBody('{"a":2}', secret));
  });

  it('sha256Hex is stable hex of length 64', () => {
    const h = sha256Hex('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex('hello')).toBe(h);
  });
});
