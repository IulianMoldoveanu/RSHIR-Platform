// Wolt Merchant API adapter — Tier 1 official integration.
//
// Reference: developer.wolt.com / Wolt Marketplace API
// Auth model:
//   - HIR is an Integration Partner (apply at developer.wolt.com).
//   - On approval Wolt issues `WOLT_PARTNER_API_KEY` (HIR-level platform key)
//     and assigns each tenant a `venue_id`.
//   - Webhook subscriptions configured per venue; payloads signed with a
//     per-venue HMAC secret returned at subscription creation.
//
// Inbound event flow:
//   Wolt POST → /api/webhooks/aggregator/wolt (handles env gating + secret lookup)
//   route reads raw body + `wolt-signature` header + secret
//   calls woltAdapter.verifyWebhook(ctx, raw, headers, secret)
//   on valid event → INSERT into aggregator_webhook_events (idempotency)
//   on new row → push order into restaurant_orders via ingest pipeline
//
// integration-core ships to edge + browser too, so adapters here:
//   - never reach into process.env directly (the route does that)
//   - use Web Crypto (crypto.subtle), not node:crypto

import type {
  AggregatorAdapter,
  AggregatorCapabilities,
  AggregatorContext,
  AggregatorCredentials,
  AggregatorOrderEvent,
} from './contract';

const CAPABILITIES: AggregatorCapabilities = {
  canAcceptOrder: true,
  canRejectOrder: true,
  canReportFulfillment: true,
  hasSignedWebhooks: true,
};

const WOLT_API_BASE = 'https://restaurant-api.wolt.com';

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
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Verify the `wolt-signature` header using HMAC-SHA256 of the raw body. */
async function verifyWoltSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader) return false;
  // Wolt signature format: `t=<timestamp>,v1=<hex>` per their webhook spec.
  // Until we receive the official spec from Partner onboarding, we accept
  // either the canonical `v1=<hex>` or a bare hex string for the early
  // sandbox phase.
  const v1 =
    signatureHeader.split(',').find((part) => part.startsWith('v1='))?.slice(3) ?? signatureHeader;
  const expected = await hmacSha256Hex(secret, rawBody);
  return constantTimeEqualHex(v1, expected);
}

function mapEventKind(woltType: string): AggregatorOrderEvent['kind'] | null {
  switch (woltType) {
    case 'order.created':
    case 'order.placed':
      return 'order.placed';
    case 'order.acknowledged':
    case 'order.accepted':
      return 'order.accepted';
    case 'order.cancelled':
      return 'order.cancelled';
    case 'order.picked_up':
    case 'order.in_transit':
      return 'order.picked_up';
    case 'order.delivered':
    case 'order.completed':
      return 'order.delivered';
    default:
      return null;
  }
}

type WoltWebhookOptions = {
  /** Per-venue HMAC secret provided by Wolt at subscription creation. */
  webhookSecret: string;
};

export const woltAdapter: AggregatorAdapter & {
  verifyWebhookWithSecret: (
    ctx: AggregatorContext,
    rawBody: string,
    headers: Record<string, string>,
    options: WoltWebhookOptions,
  ) => Promise<AggregatorOrderEvent | null>;
} = {
  key: 'wolt',
  subtype: 'API',
  capabilities: CAPABILITIES,

  // Default contract method — caller is expected to attach the secret via
  // a closure/wrapper at the route layer. This stub returns null so the
  // adapter can be imported from a browser bundle without violating types.
  async verifyWebhook(ctx) {
    ctx.log('warn', 'wolt verifyWebhook called without secret — use verifyWebhookWithSecret');
    return null;
  },

  async verifyWebhookWithSecret(ctx, rawBody, headers, { webhookSecret }) {
    if (!(await verifyWoltSignature(rawBody, headers['wolt-signature'], webhookSecret))) {
      ctx.log('warn', 'wolt webhook signature verification failed');
      return null;
    }

    let payload: WoltWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as WoltWebhookPayload;
    } catch {
      ctx.log('error', 'wolt webhook body not valid JSON');
      return null;
    }

    const kind = mapEventKind(payload.type ?? '');
    if (!kind) {
      ctx.log('info', 'wolt event type not mapped — acking', { type: payload.type });
      return null;
    }

    return normalizeWoltPayload(payload, kind);
  },

  async acceptOrder(ctx, creds: AggregatorCredentials, providerOrderId) {
    try {
      const res = await ctx.fetch(
        `${WOLT_API_BASE}/venues/${creds.venueId}/orders/${providerOrderId}/accept`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${creds.apiKey}`,
          },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) return { ok: false, error: `wolt_accept_http_${res.status}` };
      return { ok: true };
    } catch (err) {
      ctx.log('error', 'wolt accept threw', { err: String(err) });
      return { ok: false, error: 'wolt_accept_network' };
    }
  },

  async rejectOrder(ctx, creds: AggregatorCredentials, providerOrderId, reason) {
    try {
      const res = await ctx.fetch(
        `${WOLT_API_BASE}/venues/${creds.venueId}/orders/${providerOrderId}/reject`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${creds.apiKey}`,
          },
          body: JSON.stringify({ reason }),
        },
      );
      if (!res.ok) return { ok: false, error: `wolt_reject_http_${res.status}` };
      return { ok: true };
    } catch (err) {
      ctx.log('error', 'wolt reject threw', { err: String(err) });
      return { ok: false, error: 'wolt_reject_network' };
    }
  },
};

type WoltWebhookPayload = {
  type?: string;
  order?: {
    id?: string;
    venue?: { id?: string };
    customer?: {
      first_name?: string;
      phone_number?: string;
    };
    items?: ReadonlyArray<{
      name?: string;
      count?: number;
      unit_price?: { amount?: number };
      options?: ReadonlyArray<{ name?: string; count?: number }>;
      notes?: string;
    }>;
    price?: {
      total?: number;
      delivery_fee?: number;
      service_fee?: number;
      tip?: number;
    };
    delivery?: {
      address?: string;
      coordinates?: { lat?: number; lng?: number };
      promised_at?: string;
    };
  };
  occurred_at?: string;
};

function normalizeWoltPayload(
  payload: WoltWebhookPayload,
  kind: AggregatorOrderEvent['kind'],
): AggregatorOrderEvent {
  const order = payload.order ?? {};
  return {
    providerOrderId: order.id ?? 'unknown',
    providerVenueId: order.venue?.id ?? 'unknown',
    source: { type: 'wolt', subtype: 'API' },
    kind,
    occurredAt: payload.occurred_at ?? new Date().toISOString(),
    customer: {
      firstName: order.customer?.first_name ?? null,
      phone: order.customer?.phone_number ?? null,
    },
    items:
      order.items?.map((item) => ({
        name: item.name ?? '',
        quantity: item.count ?? 1,
        unitPriceBani: item.unit_price?.amount ?? null,
        modifiers: item.options?.map((opt) => ({ name: opt.name ?? '', quantity: opt.count ?? 1 })),
        notes: item.notes,
      })) ?? [],
    totals: {
      grossBani: order.price?.total ?? null,
      deliveryFeeBani: order.price?.delivery_fee ?? null,
      serviceFeeBani: order.price?.service_fee ?? null,
      tipBani: order.price?.tip ?? null,
    },
    delivery: {
      addressLine: order.delivery?.address ?? null,
      lat: order.delivery?.coordinates?.lat ?? null,
      lng: order.delivery?.coordinates?.lng ?? null,
      promisedAt: order.delivery?.promised_at ?? null,
    },
    rawPayload: payload as Record<string, unknown>,
  };
}
