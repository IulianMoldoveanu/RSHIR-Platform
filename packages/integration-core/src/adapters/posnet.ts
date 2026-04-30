// Posnet POS adapter — scaffold pending vendor spec.
//
// Posnet is one of the eight RO POS vendors HIR researched in Sprint 11;
// like Freya it has no public API documentation and integration is
// sales-led. Same trade-off as Freya: ship the scaffold so admins can
// pick "Posnet" without an "unsupported" error and so the dispatcher /
// audit trail prove end-to-end during contract negotiation. When a
// paying tenant requests Posnet, we get the spec from their account
// manager and fill in real request bodies.
//
// Differences from Freya:
//   - Posnet's webhook signature header is `x-posnet-signature` (assumed;
//     swap once spec lands).
//   - The HMAC algorithm is SHA-256 hex by default — same as Freya. If
//     Posnet uses a different scheme (e.g., base64, JWT), this is the
//     only function that needs to change.
//   - Per-locale Posnet deployments use a `merchant_id` instead of
//     `location_id`. Reflected in the config shape below.
//
// All other behavior (retry semantics, log shape, fail-loudly-when-
// config-incomplete) mirrors freya.ts.

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

const POSNET_SIG_HEADER = 'x-posnet-signature';

type PosnetConfig = {
  base_url?: string;
  api_key?: string;
  merchant_id?: string;
};

function readConfig(ctx: AdapterContext): PosnetConfig {
  const c = ctx.provider.config as Record<string, unknown>;
  return {
    base_url: typeof c.base_url === 'string' ? c.base_url : undefined,
    api_key: typeof c.api_key === 'string' ? c.api_key : undefined,
    merchant_id: typeof c.merchant_id === 'string' ? c.merchant_id : undefined,
  };
}

function configReady(cfg: PosnetConfig): cfg is Required<PosnetConfig> {
  return Boolean(cfg.base_url && cfg.api_key && cfg.merchant_id);
}

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

export const posnetAdapter: IntegrationAdapter = {
  providerKey: 'posnet',

  async onOrderEvent(
    ctx: AdapterContext,
    event: OrderEventName,
    payload: OrderPayload,
  ): Promise<AdapterResult> {
    const cfg = readConfig(ctx);
    if (!configReady(cfg)) {
      ctx.log('warn', `[posnet] order.${event} skipped — config incomplete`, {
        orderId: payload.orderId,
        missing: ['base_url', 'api_key', 'merchant_id'].filter(
          (k) => !(cfg as Record<string, unknown>)[k],
        ),
      });
      return { ok: false, retry: false, error: 'posnet_config_incomplete' };
    }
    try {
      const res = await ctx.fetch(`${cfg.base_url}/orders/${event}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.api_key}`,
          'x-posnet-merchant': cfg.merchant_id,
        },
        body: JSON.stringify({ event, merchantId: cfg.merchant_id, order: payload }),
      });
      if (res.ok) {
        ctx.log('info', `[posnet] order.${event} delivered`, { orderId: payload.orderId });
        return { ok: true };
      }
      const retry = res.status >= 500 || res.status === 429;
      ctx.log('warn', `[posnet] order.${event} ${res.status}`, { orderId: payload.orderId, retry });
      return { ok: false, retry, error: `posnet_http_${res.status}` };
    } catch (e) {
      ctx.log('error', `[posnet] order.${event} threw`, { error: (e as Error).message });
      return { ok: false, retry: true, error: 'posnet_network_error' };
    }
  },

  async onMenuEvent(
    ctx: AdapterContext,
    event: MenuEventName,
    payload: MenuItemPayload,
  ): Promise<AdapterResult> {
    const cfg = readConfig(ctx);
    if (!configReady(cfg)) {
      ctx.log('warn', `[posnet] menu.${event} skipped — config incomplete`, {
        itemId: payload.itemId,
      });
      return { ok: false, retry: false, error: 'posnet_config_incomplete' };
    }
    try {
      const res = await ctx.fetch(`${cfg.base_url}/menu/${event}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.api_key}`,
          'x-posnet-merchant': cfg.merchant_id,
        },
        body: JSON.stringify({ event, merchantId: cfg.merchant_id, item: payload }),
      });
      if (res.ok) {
        ctx.log('info', `[posnet] menu.${event} delivered`, { itemId: payload.itemId });
        return { ok: true };
      }
      const retry = res.status >= 500 || res.status === 429;
      return { ok: false, retry, error: `posnet_http_${res.status}` };
    } catch (e) {
      ctx.log('error', `[posnet] menu.${event} threw`, { error: (e as Error).message });
      return { ok: false, retry: true, error: 'posnet_network_error' };
    }
  },

  async verifyWebhook(
    ctx: AdapterContext,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookEvent> {
    const got = headers[POSNET_SIG_HEADER] ?? headers[POSNET_SIG_HEADER.toLowerCase()];
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

    const kind = typeof obj.event_type === 'string' ? obj.event_type : obj.kind;
    if (kind === 'order.status_changed' || kind === 'status_changed') {
      const orderId = typeof obj.order_id === 'string' ? obj.order_id : obj.orderId;
      const status = typeof obj.status === 'string' ? obj.status : null;
      if (typeof orderId === 'string' && typeof status === 'string') {
        return { kind: 'order.status_changed', orderId, status };
      }
    }
    return null;
  },
};
