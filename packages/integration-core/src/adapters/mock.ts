// Mock adapter — no-op reference implementation.
// Every call returns ok and emits an info log so the dispatcher / audit log
// can demonstrate end-to-end flow without a real POS attached. Used by:
//  - STANDALONE tenants (default; never invoked because the bus skips them)
//  - QA / integration tests / first-pilot demos
//  - Webhook-IN smoke tests via a dummy HMAC of the body

import type {
  AdapterContext,
  AdapterResult,
  IntegrationAdapter,
  MenuEventName,
  MenuItemPayload,
  OrderEventName,
  OrderPayload,
  WebhookEvent,
} from '../contract';

const MOCK_SIG_HEADER = 'x-hir-mock-signature';

function hex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return hex(sig);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const mockAdapter: IntegrationAdapter = {
  providerKey: 'mock',

  async onOrderEvent(
    ctx: AdapterContext,
    event: OrderEventName,
    payload: OrderPayload,
  ): Promise<AdapterResult> {
    ctx.log('info', `[mock] order.${event}`, {
      orderId: payload.orderId,
      status: payload.status,
      total: payload.totals.totalRon,
    });
    return { ok: true };
  },

  async onMenuEvent(
    ctx: AdapterContext,
    event: MenuEventName,
    payload: MenuItemPayload,
  ): Promise<AdapterResult> {
    ctx.log('info', `[mock] menu.${event}`, {
      itemId: payload.itemId,
      name: payload.name,
      isAvailable: payload.isAvailable,
    });
    return { ok: true };
  },

  async verifyWebhook(
    ctx: AdapterContext,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookEvent> {
    const got = headers[MOCK_SIG_HEADER] ?? headers[MOCK_SIG_HEADER.toLowerCase()];
    if (!got) return null;
    const expected = await hmacSha256Hex(ctx.provider.webhookSecret, rawBody);
    if (!safeEqual(got, expected)) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.kind === 'order.status_changed' && typeof obj.orderId === 'string' && typeof obj.status === 'string') {
      return { kind: 'order.status_changed', orderId: obj.orderId, status: obj.status };
    }
    return null;
  },
};
