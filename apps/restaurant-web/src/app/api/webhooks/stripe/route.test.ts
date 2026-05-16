// Tests for the deprecated Stripe webhook stub. Iulian directive 2026-05-16
// — Stripe is excluded from RSHIR's active payment path. The route now
// returns 410 Gone with a structured migration pointer for any Stripe
// deliveries that still arrive (the endpoint itself is removed from Stripe
// dashboard, but a few retries can race the cutover).

import { describe, expect, it } from 'vitest';
import { POST, GET } from './route';

function makeReq(method: 'GET' | 'POST') {
  return new Request('http://localhost/api/webhooks/stripe', { method });
}

describe('Deprecated /api/webhooks/stripe', () => {
  it('POST returns 410 Gone with stripe_deprecated + migration_doc', async () => {
    const res = await POST(makeReq('POST'));
    expect(res.status).toBe(410);
    const json = (await res.json()) as {
      error: string;
      migration_doc: string;
      message: string;
    };
    expect(json.error).toBe('stripe_deprecated');
    expect(json.migration_doc).toBe('/docs/payments-migration');
    expect(json.message).toContain('Netopia');
  });

  it('GET also returns 410 (so probes see the same signal)', async () => {
    const res = await GET(makeReq('GET'));
    expect(res.status).toBe(410);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('stripe_deprecated');
  });
});
