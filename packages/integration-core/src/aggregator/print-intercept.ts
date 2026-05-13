// Print Intercept aggregator adapter — Tier 3, deployable today at
// Foișorul A without partnership or sideload.
//
// How it works (full deploy plan in 2026-05-12-STRATEGIC-MEGA-PLAN.md):
//   1. Restaurant uses a Star Micronics CloudPRNT-enabled thermal
//      printer (e.g. TSP143IIIW, mC-Print3, BSC-10II), OR a small
//      Android companion device on the local network.
//   2. The companion intercepts the ESC-POS / StarPRNT byte stream
//      emitted by the Glovo / Wolt / Bolt tablet app before it reaches
//      the kitchen printer.
//   3. Parses recognizable patterns (order id, customer name, items,
//      totals) and POSTs the parsed envelope to
//      /api/webhooks/aggregator/print-intercept with a per-restaurant
//      HMAC.
//   4. This adapter validates the signature + normalizes to
//      AggregatorOrderEvent.
//
// integration-core ships to edge/browser too, so this file uses Web
// Crypto and never reads process.env directly — the route does that.

import type {
  AggregatorAdapter,
  AggregatorCapabilities,
  AggregatorContext,
  AggregatorOrderEvent,
  AggregatorProviderKey,
} from './contract';

const CAPABILITIES: AggregatorCapabilities = {
  // Print intercept is PASSIVE — we read the printout, we don't talk
  // back to the aggregator. So we cannot accept/reject or report
  // fulfillment via this tier.
  canAcceptOrder: false,
  canRejectOrder: false,
  canReportFulfillment: false,
  hasSignedWebhooks: true,
};

/** Envelope the print-companion posts to /api/webhooks/aggregator/print-intercept */
export type PrintInterceptEnvelope = {
  provider: AggregatorProviderKey;
  providerOrderId: string;
  tenantId: string;
  capturedAt: string;
  customer: { firstName: string | null; phone: string | null };
  items: ReadonlyArray<{ name: string; quantity: number; notes?: string }>;
  totals: { grossBani: number | null; deliveryFeeBani: number | null };
  delivery: { addressLine: string | null };
  rawReceiptBase64?: string;
};

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

async function verifySignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!signature) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return constantTimeEqualHex(signature, expected);
}

type PrintInterceptOptions = {
  /** Shared HMAC secret per restaurant — issued at companion pairing time. */
  webhookSecret: string;
};

export const printInterceptAdapter: AggregatorAdapter & {
  verifyWebhookWithSecret: (
    ctx: AggregatorContext,
    rawBody: string,
    headers: Record<string, string>,
    options: PrintInterceptOptions,
  ) => Promise<AggregatorOrderEvent | null>;
} = {
  // Sentinel key — each event's `source.type` reflects the actual
  // provider (wolt/glovo/bolt) detected by the companion's parser.
  key: 'wolt',
  subtype: 'PRINT',
  capabilities: CAPABILITIES,

  async verifyWebhook(ctx) {
    ctx.log(
      'warn',
      'print-intercept verifyWebhook called without secret — use verifyWebhookWithSecret',
    );
    return null;
  },

  async verifyWebhookWithSecret(ctx, rawBody, headers, { webhookSecret }) {
    if (!(await verifySignature(rawBody, headers['x-hir-print-signature'], webhookSecret))) {
      ctx.log('warn', 'print-intercept signature verification failed');
      return null;
    }

    let envelope: PrintInterceptEnvelope;
    try {
      envelope = JSON.parse(rawBody) as PrintInterceptEnvelope;
    } catch {
      ctx.log('error', 'print-intercept body not valid JSON');
      return null;
    }

    return normalizePrintEnvelope(envelope);
  },
};

function normalizePrintEnvelope(envelope: PrintInterceptEnvelope): AggregatorOrderEvent {
  return {
    providerOrderId: envelope.providerOrderId,
    providerVenueId: envelope.tenantId,
    source: { type: envelope.provider, subtype: 'PRINT' },
    kind: 'order.placed',
    occurredAt: envelope.capturedAt,
    customer: envelope.customer,
    items: envelope.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPriceBani: null,
      notes: item.notes,
    })),
    totals: {
      grossBani: envelope.totals.grossBani,
      deliveryFeeBani: envelope.totals.deliveryFeeBani,
      serviceFeeBani: null,
      tipBani: null,
    },
    delivery: {
      addressLine: envelope.delivery.addressLine,
      lat: null,
      lng: null,
      promisedAt: null,
    },
    rawPayload: envelope as unknown as Record<string, unknown>,
  };
}
