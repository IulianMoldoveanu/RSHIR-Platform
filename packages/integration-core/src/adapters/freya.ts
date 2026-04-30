// Freya POS adapter — scaffold pending vendor spec.
//
// Freya is one of two RO POS systems in Brașov pilot 2 (the operator's
// second target). Per the Sprint 11 plan, real vendor adapters wait for
// the first paying request — once a tenant signs we get the API spec from
// the Freya account manager and fill in the actual request bodies. Until
// then, this adapter:
//
//   - is registered in the provider registry so admins can pick "Freya"
//     in the integrations dropdown without an "unsupported" error,
//   - returns retry=false on every push call when config is empty so the
//     dispatcher doesn't pile up DEAD rows for a tenant who picked Freya
//     before the integration is contracted,
//   - implements a standard HMAC-SHA256 webhook verifier (`x-freya-
//     signature` header, hex-encoded digest of the raw body using
//     `provider.webhookSecret`) which is the most common RO POS pattern
//     and will cover the real flow with no rewrite if Freya follows it,
//   - logs every call so we can prove end-to-end during pilot kickoff.
//
// When the real spec arrives, the only changes needed are:
//   - parse `config.base_url`, `config.api_key`, `config.location_id`
//     into the request URL/headers/body,
//   - swap the placeholder JSON body shape for the actual Freya schema,
//   - extend verifyWebhook's parsed-event branches to match Freya's
//     event vocabulary.

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

const FREYA_SIG_HEADER = 'x-freya-signature';

type FreyaConfig = {
  base_url?: string;
  api_key?: string;
  location_id?: string;
};

function readConfig(ctx: AdapterContext): FreyaConfig {
  const c = ctx.provider.config as Record<string, unknown>;
  return {
    base_url: typeof c.base_url === 'string' ? c.base_url : undefined,
    api_key: typeof c.api_key === 'string' ? c.api_key : undefined,
    location_id: typeof c.location_id === 'string' ? c.location_id : undefined,
  };
}

function configReady(cfg: FreyaConfig): cfg is Required<FreyaConfig> {
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

export const freyaAdapter: IntegrationAdapter = {
  providerKey: 'freya',

  async onOrderEvent(
    ctx: AdapterContext,
    event: OrderEventName,
    payload: OrderPayload,
  ): Promise<AdapterResult> {
    const cfg = readConfig(ctx);
    if (!configReady(cfg)) {
      ctx.log('warn', `[freya] order.${event} skipped — config incomplete`, {
        orderId: payload.orderId,
        missing: ['base_url', 'api_key', 'location_id'].filter(
          (k) => !(cfg as Record<string, unknown>)[k],
        ),
      });
      // retry=false so the dispatcher marks it FAILED-not-DEAD and the
      // operator knows to fill in the credentials. A retry storm against
      // an unconfigured tenant only buries the real error.
      return { ok: false, retry: false, error: 'freya_config_incomplete' };
    }

    // Placeholder request shape — replace once Freya publishes their spec.
    // The retry-on-5xx convention matches what the dispatcher expects.
    try {
      const res = await ctx.fetch(`${cfg.base_url}/orders/${event}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.api_key}`,
          'x-freya-location': cfg.location_id,
        },
        body: JSON.stringify({ event, locationId: cfg.location_id, order: payload }),
      });
      if (res.ok) {
        ctx.log('info', `[freya] order.${event} delivered`, { orderId: payload.orderId });
        return { ok: true };
      }
      const retry = res.status >= 500 || res.status === 429;
      ctx.log('warn', `[freya] order.${event} ${res.status}`, { orderId: payload.orderId, retry });
      return { ok: false, retry, error: `freya_http_${res.status}` };
    } catch (e) {
      ctx.log('error', `[freya] order.${event} threw`, { error: (e as Error).message });
      return { ok: false, retry: true, error: 'freya_network_error' };
    }
  },

  async onMenuEvent(
    ctx: AdapterContext,
    event: MenuEventName,
    payload: MenuItemPayload,
  ): Promise<AdapterResult> {
    const cfg = readConfig(ctx);
    if (!configReady(cfg)) {
      ctx.log('warn', `[freya] menu.${event} skipped — config incomplete`, {
        itemId: payload.itemId,
      });
      return { ok: false, retry: false, error: 'freya_config_incomplete' };
    }
    try {
      const res = await ctx.fetch(`${cfg.base_url}/menu/${event}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.api_key}`,
          'x-freya-location': cfg.location_id,
        },
        body: JSON.stringify({ event, locationId: cfg.location_id, item: payload }),
      });
      if (res.ok) {
        ctx.log('info', `[freya] menu.${event} delivered`, { itemId: payload.itemId });
        return { ok: true };
      }
      const retry = res.status >= 500 || res.status === 429;
      return { ok: false, retry, error: `freya_http_${res.status}` };
    } catch (e) {
      ctx.log('error', `[freya] menu.${event} threw`, { error: (e as Error).message });
      return { ok: false, retry: true, error: 'freya_network_error' };
    }
  },

  async verifyWebhook(
    ctx: AdapterContext,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookEvent> {
    const got = headers[FREYA_SIG_HEADER] ?? headers[FREYA_SIG_HEADER.toLowerCase()];
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

    // Most RO POS systems push an event_type discriminator. We accept the
    // common shapes and let unknown kinds fall through to null (the router
    // will return 200 ok for forward-compat per the existing webhook IN
    // contract).
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
