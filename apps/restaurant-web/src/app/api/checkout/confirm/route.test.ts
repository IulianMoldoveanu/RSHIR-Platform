// Tests for the deprecated /api/checkout/confirm stub. Iulian directive
// 2026-05-16 — Stripe is excluded; client-driven confirm is no longer
// needed because Netopia/Viva webhooks are the single source of truth for
// payment state. The route returns 410 Gone for both POST and GET.

import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from './route';

function makeReq(method: 'GET' | 'POST') {
  return new NextRequest('http://localhost/api/checkout/confirm', { method });
}

describe('Deprecated /api/checkout/confirm', () => {
  it('POST returns 410 Gone with stripe_confirm_deprecated', async () => {
    const res = await POST(makeReq('POST'));
    expect(res.status).toBe(410);
    const json = (await res.json()) as {
      error: string;
      migration_doc: string;
    };
    expect(json.error).toBe('stripe_confirm_deprecated');
    expect(json.migration_doc).toBe('/docs/payments-migration');
  });

  it('GET also returns 410', async () => {
    const res = await GET(makeReq('GET'));
    expect(res.status).toBe(410);
  });
});
