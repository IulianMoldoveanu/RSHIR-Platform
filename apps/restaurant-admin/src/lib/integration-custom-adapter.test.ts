// Unit tests for the Custom HTTPS-webhook adapter.
//
// The adapter lives in @hir/integration-core but the package has no
// vitest harness today; placing the tests here lets us reuse the
// existing restaurant-admin vitest setup without bloating the package.
// Move these into packages/integration-core/src/adapters/__tests__/
// the day a second adapter starts needing tests.

import { describe, expect, it, vi } from 'vitest';
import {
  customAdapter,
  isSafeWebhookUrl,
  validateCustomConfig,
} from '@hir/integration-core';
import type { OrderPayload } from '@hir/integration-core';

const SAMPLE_ORDER: OrderPayload = {
  orderId: 'ord_test_1',
  source: 'INTERNAL_STOREFRONT',
  status: 'NEW',
  items: [{ name: 'Pizza Margherita', qty: 1, priceRon: 35 }],
  totals: { subtotalRon: 35, deliveryFeeRon: 10, totalRon: 45 },
  customer: { firstName: 'Iulian', phone: '+40700000001' },
  dropoff: { line1: 'Str. Foișorului 1', city: 'Brașov' },
  notes: null,
};

const VALID_CONFIG = {
  webhook_url: 'https://example.com/hir-hook',
  fire_on_statuses: ['NEW', 'DELIVERED'],
};

const SECRET = 'test-secret-aabbccddeeff0011';

function makeCtx(overrides: Partial<{
  config: Record<string, unknown>;
  fetch: typeof fetch;
}> = {}) {
  return {
    tenantId: 'tenant-1',
    provider: {
      key: 'custom' as const,
      config: overrides.config ?? VALID_CONFIG,
      webhookSecret: SECRET,
    },
    fetch: overrides.fetch ?? fetch,
    log: vi.fn(),
  };
}

describe('isSafeWebhookUrl', () => {
  it('accepts https public hosts', () => {
    expect(isSafeWebhookUrl('https://example.com/hook')).toEqual({ ok: true });
    expect(isSafeWebhookUrl('https://api.tenant.com:8443/x')).toEqual({ ok: true });
  });

  it('rejects http (no plain HTTP allowed)', () => {
    const r = isSafeWebhookUrl('http://example.com');
    expect(r.ok).toBe(false);
  });

  it('blocks localhost', () => {
    expect(isSafeWebhookUrl('https://localhost/x').ok).toBe(false);
    expect(isSafeWebhookUrl('https://localhost.localdomain/x').ok).toBe(false);
  });

  it('blocks private IPv4 ranges', () => {
    expect(isSafeWebhookUrl('https://10.0.0.5').ok).toBe(false);
    expect(isSafeWebhookUrl('https://10.255.255.1').ok).toBe(false);
    expect(isSafeWebhookUrl('https://172.16.0.1').ok).toBe(false);
    expect(isSafeWebhookUrl('https://172.31.255.1').ok).toBe(false);
    expect(isSafeWebhookUrl('https://192.168.1.1').ok).toBe(false);
  });

  it('blocks loopback / link-local / metadata', () => {
    expect(isSafeWebhookUrl('https://127.0.0.1').ok).toBe(false);
    expect(isSafeWebhookUrl('https://169.254.169.254').ok).toBe(false);
    expect(isSafeWebhookUrl('https://0.0.0.0').ok).toBe(false);
  });

  it('blocks IPv6 loopback / unique-local / link-local', () => {
    expect(isSafeWebhookUrl('https://[::1]').ok).toBe(false);
    expect(isSafeWebhookUrl('https://[fc00::1]').ok).toBe(false);
    expect(isSafeWebhookUrl('https://[fd12:abcd::1]').ok).toBe(false);
    expect(isSafeWebhookUrl('https://[fe80::1]').ok).toBe(false);
  });

  it('lets public IPv4 through (last octet boundary OK)', () => {
    expect(isSafeWebhookUrl('https://8.8.8.8').ok).toBe(true);
    expect(isSafeWebhookUrl('https://172.32.0.1').ok).toBe(true); // outside /12
    expect(isSafeWebhookUrl('https://172.15.0.1').ok).toBe(true); // outside /12
  });

  it('rejects unparseable URLs', () => {
    expect(isSafeWebhookUrl('not-a-url').ok).toBe(false);
    expect(isSafeWebhookUrl('').ok).toBe(false);
  });
});

describe('validateCustomConfig', () => {
  it('accepts a well-formed config', () => {
    const r = validateCustomConfig(VALID_CONFIG);
    expect(r.ok).toBe(true);
  });

  it('rejects missing webhook_url', () => {
    const r = validateCustomConfig({ fire_on_statuses: ['NEW'] });
    expect(r).toEqual({ ok: false, error: 'webhook_url_missing' });
  });

  it('rejects empty status list', () => {
    const r = validateCustomConfig({
      webhook_url: 'https://example.com/x',
      fire_on_statuses: [],
    });
    expect(r).toEqual({ ok: false, error: 'fire_on_statuses_empty' });
  });

  it('rejects unknown status enum', () => {
    const r = validateCustomConfig({
      webhook_url: 'https://example.com/x',
      fire_on_statuses: ['NEW', 'BOGUS'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('fire_on_statuses_invalid');
  });

  it('refuses non-https urls', () => {
    const r = validateCustomConfig({
      webhook_url: 'http://example.com',
      fire_on_statuses: ['NEW'],
    });
    expect(r).toEqual({ ok: false, error: 'webhook_url_not_https' });
  });
});

describe('customAdapter.onOrderEvent — happy path', () => {
  it('POSTs to webhook_url with HMAC and returns ok:true on 2xx', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = (async (url: unknown, init?: unknown) => {
      calls.push({ url: String(url), init: init as RequestInit });
      return new Response('ok', { status: 200 });
    }) as typeof fetch;

    const ctx = makeCtx({ fetch: fakeFetch });
    const r = await customAdapter.onOrderEvent(ctx, 'created', SAMPLE_ORDER);
    expect(r.ok).toBe(true);

    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.url).toBe(VALID_CONFIG.webhook_url);
    expect(c.init.method).toBe('POST');
    const headers = c.init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['x-hir-signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(headers['x-hir-event']).toBe('order.created');

    const body = JSON.parse(c.init.body as string);
    expect(body.event).toBe('order.created');
    expect(body.test_mode).toBe(false);
    expect(body.order.orderId).toBe(SAMPLE_ORDER.orderId);
  });

  it('marks test_mode=true when payload carries the internal flag', async () => {
    const calls: Array<RequestInit> = [];
    const fakeFetch = (async (_url: unknown, init?: unknown) => {
      calls.push(init as RequestInit);
      return new Response('ok', { status: 200 });
    }) as typeof fetch;

    const testPayload = {
      ...SAMPLE_ORDER,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __hir_test_mode: true,
    } as unknown as OrderPayload;
    const ctx = makeCtx({ fetch: fakeFetch });
    const r = await customAdapter.onOrderEvent(ctx, 'created', testPayload);
    expect(r.ok).toBe(true);

    const body = JSON.parse(calls[0]!.body as string);
    expect(body.test_mode).toBe(true);
    // Internal flag is stripped from the outbound order payload.
    expect(body.order.__hir_test_mode).toBeUndefined();
  });
});

describe('customAdapter.onOrderEvent — failure paths', () => {
  it('returns retry=true on 5xx', async () => {
    const fakeFetch = (async () =>
      new Response('boom', { status: 503 })) as typeof fetch;
    const ctx = makeCtx({ fetch: fakeFetch });
    const r = await customAdapter.onOrderEvent(ctx, 'created', SAMPLE_ORDER);
    expect(r).toEqual({ ok: false, retry: true, error: 'custom_http_503' });
  });

  it('returns retry=false on 4xx (config error on receiver side)', async () => {
    const fakeFetch = (async () =>
      new Response('bad', { status: 400 })) as typeof fetch;
    const ctx = makeCtx({ fetch: fakeFetch });
    const r = await customAdapter.onOrderEvent(ctx, 'created', SAMPLE_ORDER);
    expect(r).toEqual({ ok: false, retry: false, error: 'custom_http_400' });
  });

  it('returns retry=true on network error', async () => {
    const fakeFetch = (async () => {
      throw new Error('ECONNRESET');
    }) as typeof fetch;
    const ctx = makeCtx({ fetch: fakeFetch });
    const r = await customAdapter.onOrderEvent(ctx, 'created', SAMPLE_ORDER);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retry).toBe(true);
      expect(r.error).toBe('custom_network_error');
    }
  });

  it('refuses to send when config invalid (SSRF block)', async () => {
    const fetchSpy = vi.fn();
    const fakeFetch = (async (...args: unknown[]) => {
      fetchSpy(...args);
      return new Response('', { status: 200 });
    }) as typeof fetch;
    const ctx = makeCtx({
      config: { webhook_url: 'https://10.0.0.1/x', fire_on_statuses: ['NEW'] },
      fetch: fakeFetch,
    });
    const r = await customAdapter.onOrderEvent(ctx, 'created', SAMPLE_ORDER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('webhook_url_private_ipv4');
    // No fetch attempt should have been made.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses to send when webhook_url missing', async () => {
    const fakeFetch = (async () => new Response('', { status: 200 })) as typeof fetch;
    const ctx = makeCtx({
      config: { fire_on_statuses: ['NEW'] },
      fetch: fakeFetch,
    });
    const r = await customAdapter.onOrderEvent(ctx, 'created', SAMPLE_ORDER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('webhook_url_missing');
  });
});

describe('customAdapter.onMenuEvent', () => {
  it('is a no-op in V1 (retry=false, never fetches)', async () => {
    const fetchSpy = vi.fn();
    const fakeFetch = (async (...args: unknown[]) => {
      fetchSpy(...args);
      return new Response('', { status: 200 });
    }) as typeof fetch;
    const ctx = makeCtx({ fetch: fakeFetch });
    const r = await customAdapter.onMenuEvent(ctx, 'upserted', {
      itemId: 'i1',
      name: 'X',
      description: null,
      priceRon: 10,
      isAvailable: true,
      categoryId: 'c1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retry).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
