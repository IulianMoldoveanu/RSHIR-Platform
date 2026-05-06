// Custom webhook adapter — generic HTTPS POST + HMAC-SHA256.
//
// Lets a tenant point HIR at any HTTPS endpoint they control (their own
// backend, Zapier, Make, RequestBin during testing). Every order event
// becomes a POST with a JSON body and an `X-HIR-Signature` header
// containing hex(HMAC-SHA256(body, webhook_secret)).
//
// V1 scope:
//   - onOrderEvent only (menu events skip with retry=false; will land
//     when the first tenant asks for it),
//   - status filtering applied by integration-bus before enqueue (this
//     adapter receives only the events that should be delivered),
//   - SSRF guard: HTTPS-only and a hard block on private/loopback/
//     link-local addresses to prevent a tenant from pointing the
//     dispatcher at the Supabase metadata service or an internal host,
//   - rate limiting (100 events/hour per tenant×provider) is applied
//     by integration-bus at enqueue time, not here.
//
// Config shape (validated by addProvider, defensively re-validated here):
//   {
//     "webhook_url": "https://example.com/hir-webhook",
//     "fire_on_statuses": ["NEW","PREPARING","READY","DISPATCHED","DELIVERED","CANCELLED"]
//   }
//
// The dispatcher (Edge Function, Deno) re-implements this same flow
// inline because the workspace package can't be imported into the Deno
// runtime today. Keep the two in sync — see comment in
// supabase/functions/integration-dispatcher/index.ts.

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

const SIG_HEADER = 'x-hir-signature';

export type CustomConfig = {
  webhook_url: string;
  fire_on_statuses: string[];
};

export type CustomConfigValidation =
  | { ok: true; config: CustomConfig }
  | { ok: false; error: string };

const VALID_STATUSES = new Set([
  'NEW',
  'PREPARING',
  'READY',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
]);

export function validateCustomConfig(raw: unknown): CustomConfigValidation {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'config_not_object' };
  }
  const obj = raw as Record<string, unknown>;

  const url = obj.webhook_url;
  if (typeof url !== 'string' || url.length === 0) {
    return { ok: false, error: 'webhook_url_missing' };
  }
  const urlCheck = isSafeWebhookUrl(url);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error };

  const statuses = obj.fire_on_statuses;
  if (!Array.isArray(statuses) || statuses.length === 0) {
    return { ok: false, error: 'fire_on_statuses_empty' };
  }
  for (const s of statuses) {
    if (typeof s !== 'string' || !VALID_STATUSES.has(s)) {
      return { ok: false, error: `fire_on_statuses_invalid:${String(s)}` };
    }
  }

  return {
    ok: true,
    config: { webhook_url: url, fire_on_statuses: statuses as string[] },
  };
}

// SSRF guard. The webhook URL comes from the tenant. If we don't lock
// it down, a malicious tenant could point us at Supabase's internal
// metadata service or another tenant's private network. Allow only:
//   - https://
//   - hostname that does NOT resolve to a literal private/loopback
//     range when the host IS an IP literal
// We don't do DNS resolution here (that would need an async fetch in
// the Edge runtime); the IP-literal check covers the most common
// attempt. The dispatcher repeats the same check before fetching.
export function isSafeWebhookUrl(url: string): { ok: true } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: 'webhook_url_unparseable' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'webhook_url_not_https' };
  }
  const host = parsed.hostname.toLowerCase();
  if (host.length === 0) return { ok: false, error: 'webhook_url_no_host' };

  // Block plain hostnames that mean "self".
  if (host === 'localhost' || host === 'localhost.localdomain') {
    return { ok: false, error: 'webhook_url_localhost_blocked' };
  }

  // IPv4 literal?
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const o = v4.slice(1).map((n) => Number(n));
    for (const x of o) {
      if (Number.isNaN(x) || x < 0 || x > 255) {
        return { ok: false, error: 'webhook_url_bad_ipv4' };
      }
    }
    const [a, b] = o as [number, number, number, number];
    // 10.0.0.0/8
    if (a === 10) return { ok: false, error: 'webhook_url_private_ipv4' };
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) {
      return { ok: false, error: 'webhook_url_private_ipv4' };
    }
    // 192.168.0.0/16
    if (a === 192 && b === 168) return { ok: false, error: 'webhook_url_private_ipv4' };
    // 127.0.0.0/8 loopback
    if (a === 127) return { ok: false, error: 'webhook_url_loopback_ipv4' };
    // 169.254.0.0/16 link-local (incl. cloud metadata)
    if (a === 169 && b === 254) {
      return { ok: false, error: 'webhook_url_link_local_ipv4' };
    }
    // 0.0.0.0/8 "this network"
    if (a === 0) return { ok: false, error: 'webhook_url_zero_ipv4' };
  }

  // IPv6 literal? URL.hostname strips brackets.
  if (host.includes(':')) {
    const h = host.replace(/^\[/, '').replace(/\]$/, '');
    // ::1 loopback
    if (h === '::1' || h === '0:0:0:0:0:0:0:1') {
      return { ok: false, error: 'webhook_url_loopback_ipv6' };
    }
    // fc00::/7 unique-local (fc.. or fd..)
    if (/^fc/i.test(h) || /^fd/i.test(h)) {
      return { ok: false, error: 'webhook_url_private_ipv6' };
    }
    // fe80::/10 link-local
    if (/^fe[89ab]/i.test(h)) {
      return { ok: false, error: 'webhook_url_link_local_ipv6' };
    }
  }

  return { ok: true };
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

// `test_mode` flag in the body lets the receiver distinguish a manual
// "Testează conexiunea" call (admin server action) from a real event.
export type CustomEnvelope = {
  event: string;
  test_mode: boolean;
  order: OrderPayload;
  delivered_at: string;
};

export const customAdapter: IntegrationAdapter & {
  // Exposed for the admin "Testează conexiunea" server action and for
  // unit tests that want to verify validation without poking the
  // contract surface.
  validateConfig: typeof validateCustomConfig;
  isSafeWebhookUrl: typeof isSafeWebhookUrl;
} = {
  providerKey: 'custom',
  validateConfig: validateCustomConfig,
  isSafeWebhookUrl,

  async onOrderEvent(
    ctx: AdapterContext,
    event: OrderEventName,
    payload: OrderPayload,
  ): Promise<AdapterResult> {
    const validation = validateCustomConfig(ctx.provider.config);
    if (!validation.ok) {
      ctx.log('warn', `[custom] order.${event} skipped — ${validation.error}`, {
        orderId: payload.orderId,
      });
      return { ok: false, retry: false, error: validation.error };
    }
    const cfg = validation.config;

    // Test-mode is set by the admin "Testează conexiunea" path which calls
    // this adapter directly with a synthetic payload. Real bus traffic
    // sets it to false.
    const isTest = (payload as unknown as { __hir_test_mode?: boolean }).__hir_test_mode === true;

    const envelope: CustomEnvelope = {
      event: `order.${event}`,
      test_mode: isTest,
      order: stripInternalFlags(payload),
      delivered_at: new Date().toISOString(),
    };
    const body = JSON.stringify(envelope);
    const signature = await hmacSha256Hex(ctx.provider.webhookSecret, body);

    try {
      const res = await ctx.fetch(cfg.webhook_url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SIG_HEADER]: signature,
          'x-hir-event': `order.${event}`,
          'x-hir-test-mode': isTest ? '1' : '0',
        },
        body,
      });
      if (res.ok) {
        ctx.log('info', `[custom] order.${event} delivered`, {
          orderId: payload.orderId,
          status: res.status,
          test_mode: isTest,
        });
        return { ok: true };
      }
      const retry = res.status >= 500 || res.status === 429;
      ctx.log('warn', `[custom] order.${event} HTTP ${res.status}`, {
        orderId: payload.orderId,
        retry,
      });
      return { ok: false, retry, error: `custom_http_${res.status}` };
    } catch (e) {
      ctx.log('error', `[custom] order.${event} threw`, {
        error: (e as Error).message,
      });
      return { ok: false, retry: true, error: 'custom_network_error' };
    }
  },

  async onMenuEvent(
    ctx: AdapterContext,
    event: MenuEventName,
    payload: MenuItemPayload,
  ): Promise<AdapterResult> {
    // Menu push is intentionally not in V1 — most "custom webhook"
    // tenants only care about order lifecycle. We mark retry=false so
    // the dispatcher doesn't pile up DEAD rows; if a tenant asks, we
    // wire this in a follow-up sprint.
    ctx.log('info', `[custom] menu.${event} skipped — not in V1`, {
      itemId: payload.itemId,
    });
    return { ok: false, retry: false, error: 'custom_menu_not_in_v1' };
  },

  async verifyWebhook(
    ctx: AdapterContext,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookEvent> {
    // Inbound from a custom POS: we accept the same X-HIR-Signature
    // contract we use outbound (mirror of the Mock adapter shape).
    const got = headers[SIG_HEADER] ?? headers[SIG_HEADER.toLowerCase()];
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
    if (
      obj.kind === 'order.status_changed' &&
      typeof obj.orderId === 'string' &&
      typeof obj.status === 'string'
    ) {
      return { kind: 'order.status_changed', orderId: obj.orderId, status: obj.status };
    }
    return null;
  },
};

function stripInternalFlags(payload: OrderPayload): OrderPayload {
  // Don't leak the test-mode marker into the outbound payload — it's
  // already exposed at envelope.test_mode and as a header.
  const clone = { ...payload } as OrderPayload & { __hir_test_mode?: boolean };
  delete clone.__hir_test_mode;
  return clone;
}
