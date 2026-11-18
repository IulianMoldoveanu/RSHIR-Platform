// These snippets are what a vendor copies into their checkout, so a gap here
// is a gap in every integration built from it.
//
// That already happened once: `payment` was added to POST /api/public/v1/orders
// on 13 November and the snippets were not updated, so anyone who copied one
// sent no payment block and every order landed as CARD/UNPAID — wrong for a
// site that had already charged the card, and worse for cash, where the
// courier is never told to collect at the door. These tests exist so the
// example cannot drift away from the API again without something going red.

import { describe, expect, it } from 'vitest';
import { buildSnippets } from './snippets';

const KEY = 'hir_test_key_abc123';

describe('buildSnippets', () => {
  it('sends a payment block in every language', () => {
    const s = buildSnippets(KEY);
    for (const lang of ['curl', 'node', 'python'] as const) {
      expect(s[lang], lang).toContain('payment');
      expect(s[lang], lang).toContain('CARD');
      expect(s[lang], lang).toContain('PAID');
    }
  });

  // Connect's premise is that the vendor keeps their own gateway, so the
  // example has to be the case where they already took the money.
  it('shows the already-charged case, not the default', () => {
    const { node } = buildSnippets(KEY);
    const payment = node.slice(node.indexOf('"payment"'));
    expect(payment).toMatch(/"method":\s*"CARD"/);
    expect(payment).toMatch(/"status":\s*"PAID"/);
  });

  it('carries the key and the right endpoint', () => {
    const s = buildSnippets(KEY);
    for (const lang of ['curl', 'node', 'python'] as const) {
      expect(s[lang], lang).toContain(KEY);
      expect(s[lang], lang).toContain('/api/public/v1/orders');
    }
  });

  // The fallback used to be a domain we do not own. Production sets
  // NEXT_PUBLIC_RESTAURANT_WEB_URL, so it never showed there — but any
  // deployment missing the variable handed out a broken curl.
  it('falls back to the canonical domain, never another one', () => {
    const before = process.env.NEXT_PUBLIC_RESTAURANT_WEB_URL;
    delete process.env.NEXT_PUBLIC_RESTAURANT_WEB_URL;
    try {
      const { curl } = buildSnippets(KEY);
      expect(curl).toContain('https://hirforyou.ro/api/public/v1/orders');
      expect(curl).not.toContain('hiraisolutions');
    } finally {
      if (before !== undefined) process.env.NEXT_PUBLIC_RESTAURANT_WEB_URL = before;
    }
  });

  it('keeps the required fields the API refuses without', () => {
    const { curl } = buildSnippets(KEY);
    for (const field of ['customer', 'phone', 'items', 'totals', 'totalRon', 'dropoff']) {
      expect(curl, field).toContain(field);
    }
  });
});
