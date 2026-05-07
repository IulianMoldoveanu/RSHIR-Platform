// Twilio signature validator — pure helper.
//
// Mirrored byte-for-byte from supabase/functions/voice-incoming/index.ts
// so it can be unit-tested without Deno. If you change the algorithm in
// either file, change it in both.
//
// Algorithm (per https://www.twilio.com/docs/usage/webhooks/webhooks-security):
//   1. Take the full request URL (scheme + host + path + query).
//   2. If application/x-www-form-urlencoded, append each param's name +
//      value (no separator) sorted alphabetically by name.
//   3. HMAC-SHA1 the resulting string with the Auth Token as key.
//   4. Base64-encode the digest. Compare constant-time to the header.

import { createHmac, timingSafeEqual } from 'node:crypto';

export function buildTwilioSignaturePayload(opts: {
  url: string;
  rawBody: string;
}): string {
  const params = new URLSearchParams(opts.rawBody);
  const sortedKeys = Array.from(params.keys()).sort();
  let data = opts.url;
  for (const k of sortedKeys) data += k + (params.get(k) ?? '');
  return data;
}

export function computeTwilioSignature(opts: {
  url: string;
  rawBody: string;
  authToken: string;
}): string {
  const data = buildTwilioSignaturePayload({ url: opts.url, rawBody: opts.rawBody });
  return createHmac('sha1', opts.authToken).update(data).digest('base64');
}

export function validateTwilioSignatureNode(opts: {
  url: string;
  rawBody: string;
  authToken: string;
  signature: string;
}): boolean {
  const expected = computeTwilioSignature({
    url: opts.url,
    rawBody: opts.rawBody,
    authToken: opts.authToken,
  });
  if (expected.length !== opts.signature.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(opts.signature, 'utf8'),
    );
  } catch {
    return false;
  }
}
