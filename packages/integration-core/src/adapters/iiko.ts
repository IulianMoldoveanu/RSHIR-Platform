// iiko POS adapter — scaffold using iiko's published REST conventions.
//
// iiko is the only RO-relevant POS with full public REST + webhooks docs.
// Even so, real per-tenant integration requires obtaining `apiLogin` from
// each restaurant's iikoCloud account and the per-organization
// `organizationId`. Shipping a scaffold lets admins pick "iiko" in the
// dropdown and lets us run end-to-end smoke tests once a tenant signs.
//
// Differences from freya/posnet:
//   - iiko uses an `apiLogin` token to fetch a short-lived access token
//     before each push. We DON'T implement the token exchange here; we
//     assume `config.access_token` is provided directly (mode B push)
//     until we wire the token-rotation flow.
//   - iiko's webhook header is `iiko-signature` and the body itself is
//     signed; standard HMAC-SHA256 hex matches their docs.
//   - Per-organization config field is `organization_id` (UUID).

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

const IIKO_SIG_HEADER = 'iiko-signature';

type IikoConfig = {
  base_url?: string;
  access_token?: string;
  organization_id?: string;
};

function readConfig(ctx: AdapterContext): IikoConfig {
  const c = ctx.provider.config as Record<string, unknown>;
  return {
    base_url: typeof c.base_url === 'string' ? c.base_url : undefined,
    access_token: typeof c.access_token === 'string' ? c.access_token : undefined,
    organization_id: typeof c.organization_id === 'string' ? c.organization_id : undefined,
  };
}

function configReady(cfg: IikoConfig): cfg is Required<IikoConfig> {
  return Boolean(cfg.base_url && cfg.access_token && cfg.organization_id);
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

export const iikoAdapter: IntegrationAdapter = {
  providerKey: 'iiko',

  async onOrderEvent(
    ctx: AdapterContext,
    event: OrderEventName,
    payload: OrderPayload,
  ): Promise<AdapterResult> {
    const cfg = readConfig(ctx);
    if (!configReady(cfg)) {
      ctx.log('warn', `[iiko] order.${event} skipped — config incomplete`, {
        orderId: payload.orderId,
        missing: ['base_url', 'access_token', 'organization_id'].filter(
          (k) => !(cfg as Record<string, unknown>)[k],
        ),
      });
      return { ok: false, retry: false, error: 'iiko_config_incomplete' };
    }
    try {
      const res = await ctx.fetch(`${cfg.base_url}/orders/${event}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.access_token}`,
        },
        body: JSON.stringify({
          event,
          organizationId: cfg.organization_id,
          order: payload,
        }),
      });
      if (res.ok) {
        ctx.log('info', `[iiko] order.${event} delivered`, { orderId: payload.orderId });
        return { ok: true };
      }
      // 401 from iiko means the access_token expired — token rotation isn't
      // wired yet; surface as non-retry so the operator sees it and refreshes.
      if (res.status === 401) {
        return { ok: false, retry: false, error: 'iiko_token_expired' };
      }
      const retry = res.status >= 500 || res.status === 429;
      return { ok: false, retry, error: `iiko_http_${res.status}` };
    } catch (e) {
      ctx.log('error', `[iiko] order.${event} threw`, { error: (e as Error).message });
      return { ok: false, retry: true, error: 'iiko_network_error' };
    }
  },

  async onMenuEvent(
    ctx: AdapterContext,
    event: MenuEventName,
    payload: MenuItemPayload,
  ): Promise<AdapterResult> {
    const cfg = readConfig(ctx);
    if (!configReady(cfg)) {
      ctx.log('warn', `[iiko] menu.${event} skipped — config incomplete`, {
        itemId: payload.itemId,
      });
      return { ok: false, retry: false, error: 'iiko_config_incomplete' };
    }
    try {
      const res = await ctx.fetch(`${cfg.base_url}/menu/${event}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.access_token}`,
        },
        body: JSON.stringify({
          event,
          organizationId: cfg.organization_id,
          item: payload,
        }),
      });
      if (res.ok) return { ok: true };
      if (res.status === 401) {
        return { ok: false, retry: false, error: 'iiko_token_expired' };
      }
      const retry = res.status >= 500 || res.status === 429;
      return { ok: false, retry, error: `iiko_http_${res.status}` };
    } catch (e) {
      ctx.log('error', `[iiko] menu.${event} threw`, { error: (e as Error).message });
      return { ok: false, retry: true, error: 'iiko_network_error' };
    }
  },

  async verifyWebhook(
    ctx: AdapterContext,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookEvent> {
    const got = headers[IIKO_SIG_HEADER] ?? headers[IIKO_SIG_HEADER.toLowerCase()];
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

    // iiko's docs use eventType discriminator. Accept the two shapes we
    // care about today; everything else falls through to null.
    const kind = typeof obj.eventType === 'string' ? obj.eventType : obj.kind;
    if (kind === 'order.status_changed' || kind === 'orderStatusChanged') {
      const orderId =
        typeof obj.orderId === 'string'
          ? obj.orderId
          : typeof obj.order_id === 'string'
            ? obj.order_id
            : null;
      const status = typeof obj.status === 'string' ? obj.status : null;
      if (orderId && status) {
        return { kind: 'order.status_changed', orderId, status };
      }
    }
    return null;
  },
};
