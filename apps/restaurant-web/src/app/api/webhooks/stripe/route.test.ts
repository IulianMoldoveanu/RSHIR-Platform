// Smoke tests for the Stripe webhook receiver. The signature-verified happy
// path needs a real Stripe test key (or a vi.mock of getStripe()), but the
// 503/400 early returns are pure logic and worth pinning.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

function makeReq(init: { body?: string; signature?: string | null }) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.signature) headers['stripe-signature'] = init.signature;
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers,
    body: init.body ?? '{}',
  });
}

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    // getStripe() requires a secret key to construct the client — the
    // signature-verification path needs this even if the verification fails.
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_unit_tests';
  });
  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    vi.restoreAllMocks();
  });

  it('returns 503 webhook_not_configured when STRIPE_WEBHOOK_SECRET is unset', async () => {
    const res = await POST(makeReq({ body: '{}' }));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('webhook_not_configured');
  });

  it('returns 400 missing_signature when stripe-signature header is absent', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const res = await POST(makeReq({ body: '{}' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('missing_signature');
  });

  it('returns 400 invalid_signature when the signature cannot be verified', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const res = await POST(makeReq({ body: '{}', signature: 't=1,v1=bogus' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_signature');
  });
});
