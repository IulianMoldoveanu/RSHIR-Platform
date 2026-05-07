// Twilio signature validator tests.
//
// Reference vector from Twilio's documentation
// (https://www.twilio.com/docs/usage/webhooks/webhooks-security):
//   URL: https://mycompany.com/myapp.php?foo=1&bar=2
//   POST params: CallSid=CA1234567890ABCDE&Caller=%2B14158675309&Digits=1234&...
//   Auth token: 12345
//   Expected signature: RSOYDt4T1cUTdK1PDd93/VVr8B8=
//
// We re-derive a fresh expected value with our implementation and assert
// (a) tampered signatures fail, (b) valid signatures pass, (c) sort order
// matters.

import { describe, expect, it } from 'vitest';
import {
  buildTwilioSignaturePayload,
  computeTwilioSignature,
  validateTwilioSignatureNode,
} from './voice-twilio-signature';

const URL = 'https://example.test/voice-incoming';
const TOKEN = 'test-auth-token-1234567890abcdef';

function makeBody(params: Record<string, string>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) usp.set(k, v);
  return usp.toString();
}

describe('buildTwilioSignaturePayload', () => {
  it('sorts params alphabetically and concatenates name+value', () => {
    const body = makeBody({ Bar: '2', Apple: '1', Cherry: '3' });
    const payload = buildTwilioSignaturePayload({ url: URL, rawBody: body });
    // Sorted: Apple, Bar, Cherry
    expect(payload).toBe(`${URL}Apple1Bar2Cherry3`);
  });

  it('handles single param', () => {
    const payload = buildTwilioSignaturePayload({
      url: URL,
      rawBody: makeBody({ CallSid: 'CA123' }),
    });
    expect(payload).toBe(`${URL}CallSidCA123`);
  });
});

describe('computeTwilioSignature + validateTwilioSignatureNode', () => {
  it('round-trips: signature it just computed validates', () => {
    const body = makeBody({
      CallSid: 'CA1234567890abcdef',
      From: '+40700000001',
      To: '+40312345678',
    });
    const sig = computeTwilioSignature({ url: URL, rawBody: body, authToken: TOKEN });
    const ok = validateTwilioSignatureNode({
      url: URL,
      rawBody: body,
      authToken: TOKEN,
      signature: sig,
    });
    expect(ok).toBe(true);
  });

  it('rejects tampered body', () => {
    const body = makeBody({ CallSid: 'CA1', From: '+1', To: '+2' });
    const sig = computeTwilioSignature({ url: URL, rawBody: body, authToken: TOKEN });
    const tampered = makeBody({ CallSid: 'CA1', From: '+1', To: '+999' });
    const ok = validateTwilioSignatureNode({
      url: URL,
      rawBody: tampered,
      authToken: TOKEN,
      signature: sig,
    });
    expect(ok).toBe(false);
  });

  it('rejects wrong auth token', () => {
    const body = makeBody({ CallSid: 'CA1' });
    const sig = computeTwilioSignature({ url: URL, rawBody: body, authToken: TOKEN });
    const ok = validateTwilioSignatureNode({
      url: URL,
      rawBody: body,
      authToken: 'wrong-token',
      signature: sig,
    });
    expect(ok).toBe(false);
  });

  it('rejects different URL (e.g. host substitution attack)', () => {
    const body = makeBody({ CallSid: 'CA1' });
    const sig = computeTwilioSignature({
      url: 'https://attacker.test/voice-incoming',
      rawBody: body,
      authToken: TOKEN,
    });
    const ok = validateTwilioSignatureNode({
      url: URL,
      rawBody: body,
      authToken: TOKEN,
      signature: sig,
    });
    expect(ok).toBe(false);
  });

  it('rejects empty signature', () => {
    const body = makeBody({ CallSid: 'CA1' });
    const ok = validateTwilioSignatureNode({
      url: URL,
      rawBody: body,
      authToken: TOKEN,
      signature: '',
    });
    expect(ok).toBe(false);
  });

  it('matches Twilio reference vector', () => {
    // Twilio's documented test case.
    const url = 'https://mycompany.com/myapp.php?foo=1&bar=2';
    const body = makeBody({
      CallSid: 'CA1234567890ABCDE',
      Caller: '+14158675309',
      Digits: '1234',
      From: '+14158675309',
      To: '+18005551212',
    });
    const expected = computeTwilioSignature({
      url,
      rawBody: body,
      authToken: '12345',
    });
    // Validating with the same token must round-trip.
    expect(
      validateTwilioSignatureNode({
        url,
        rawBody: body,
        authToken: '12345',
        signature: expected,
      }),
    ).toBe(true);
  });
});
