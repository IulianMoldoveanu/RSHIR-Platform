// SmartCash POS adapter — scaffold pending vendor spec.
//
// SmartCash is a Romanian POS used by mid-market restaurants (Brașov,
// Cluj). It was declared in the integration_providers.provider_key check
// constraint and is listed in the admin integrations dropdown — but no
// adapter file existed until this commit, so any tenant who picked
// SmartCash would have hit a "No adapter registered" error inside the
// dispatcher. This scaffold closes that gap.
//
// Same trade-off as freya.ts / posnet.ts: ship the scaffold with
// reasonable defaults so the admin UI is honest, and complete the real
// push/menu contract once a paying tenant signs (then we get the API
// spec from their account manager). Until then:
//
//   - registered in the provider registry (no "unsupported" error path),
//   - returns retry=false on every push when config is empty so the
//     dispatcher doesn't pile up DEAD rows for tenants who picked
//     SmartCash before integration is contracted,
//   - implements a standard HMAC-SHA256 webhook verifier with header
//     `x-smartcash-signature` — common across RO POS vendors and
//     adjustable if SmartCash's actual scheme differs.

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

const SMARTCASH_SIG_HEADER = 'x-smartcash-signature';

type SmartCashConfig = {
  base_url?: string;
  api_key?: string;
  location_id?: string;
};

function readConfig(ctx: AdapterContext): SmartCashConfig {
  const c = ctx.provider.config as Record<string, unknown>;
  return {
    base_url: typeof c.base_url === 'string' ? c.base_url : undefined,
    api_key: typeof c.api_key === 'string' ? c.api_key : undefined,
    location_id: typeof c.location_id === 'string' ? c.location_id : undefined,
  };
}

function configReady(cfg: SmartCashConfig): cfg is Required<SmartCashConfig> {
  return Boolean(cfg.base_url && cfg.api_key && cfg.location_id);
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

export const smartcashAdapter: IntegrationAdapter = {
  providerKey: 'smartcash',

  async onOrderEvent(
    ctx: AdapterContext,
    event: OrderEventName,
    payload: OrderPayload,
  ): Promise<AdapterResult> {
    const cfg = readConfig(ctx);
    if (!configReady(cfg)) {
      ctx.log('warn', `[smartcash] order.${event} skipped — config incomplete`, {
        orderId: payload.orderId,
        missing: ['base_url', 'api_key', 'location_id'].filter(
          (k) => !(cfg as Record<string, unknown>)[k],
        ),
      });
      return { ok: false, retry: false, error: 'smartcash_config_incomplete' };
    }
    try {
      const res = await ctx.fetch(`${cfg.base_url}/orders/${event}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.api_key}`,
          'x-smartcash-location': cfg.location_id,
        },
        body: JSON.stringify({ event, locationId: cfg.location_id, order: payload }),
      });
      if (res.ok) {
        ctx.log('info', `[smartcash] order.${event} delivered`, { orderId: payload.orderId });
        return { ok: true };
      }
      const retry = res.status >= 500 || res.status === 429;
      ctx.log('warn', `[smartcash] order.${event} ${res.status}`, {
        orderId: payload.orderId,
        retry,
      });
      return { ok: false, retry, error: `smartcash_http_${res.status}` };
    } catch (e) {
      ctx.log('error', `[smartcash] order.${event} threw`, { error: (e as Error).message });
      return { ok: false, retry: true, error: 'smartcash_network_error' };
    }
  },

  async onMenuEvent(
    ctx: AdapterContext,
    event: MenuEventName,
    payload: MenuItemPayload,
  ): Promise<AdapterResult> {
    const cfg = readConfig(ctx);
    if (!configReady(cfg)) {
      ctx.log('warn', `[smartcash] menu.${event} skipped — config incomplete`, {
        itemId: payload.itemId,
      });
      return { ok: false, retry: false, error: 'smartcash_config_incomplete' };
    }
    try {
      const res = await ctx.fetch(`${cfg.base_url}/menu/${event}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.api_key}`,
          'x-smartcash-location': cfg.location_id,
        },
        body: JSON.stringify({ event, locationId: cfg.location_id, item: payload }),
      });
      if (res.ok) {
        ctx.log('info', `[smartcash] menu.${event} delivered`, { itemId: payload.itemId });
        return { ok: true };
      }
      const retry = res.status >= 500 || res.status === 429;
      return { ok: false, retry, error: `smartcash_http_${res.status}` };
    } catch (e) {
      ctx.log('error', `[smartcash] menu.${event} threw`, { error: (e as Error).message });
      return { ok: false, retry: true, error: 'smartcash_network_error' };
    }
  },

  async verifyWebhook(
    ctx: AdapterContext,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookEvent> {
    const got = headers[SMARTCASH_SIG_HEADER] ?? headers[SMARTCASH_SIG_HEADER.toLowerCase()];
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
