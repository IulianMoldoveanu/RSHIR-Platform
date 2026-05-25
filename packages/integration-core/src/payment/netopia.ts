// HIR Restaurant Suite — Netopia Payments PSP adapter (V2 Marketplace).
//
// Research findings (2026-05-25):
//   - Netopia v2 uses JSON API (API token Bearer auth, no XML signing).
//   - Split via `order.split.destinations` array: destination = restaurant,
//     HIR (platform) retains the remainder automatically.
//   - Sub-merchant onboarding is MANUAL (offline agreement per restaurant);
//     Netopia assigns SELLER_ACCOUNT_ID and configures it on their backend.
//     onboardingUrl() returns null — admin UI shows the request-queue flow.
//   - V2 split was "in transition" early 2025. Confirm with Netopia before
//     going live: implementare@netopia.ro
//   - Webhook HMAC: SHA-256 of raw body, hex-encoded, in x-netopia-signature.
//
// Credential mapping (PspCredentials fields):
//   signature      → Netopia posSignature (merchant id)
//   apiKey         → Netopia API key (Bearer token for requests)
//   subMerchantId  → SELLER_ACCOUNT_ID assigned by Netopia (MARKETPLACE only)
//   webhookSecret  → NETOPIA_WEBHOOK_SECRET (HMAC key for webhook verification)
//
// Env vars read by provider-router.ts (NOT read here — adapters stay env-free):
//   NETOPIA_SANDBOX_SIGNATURE / NETOPIA_LIVE_SIGNATURE
//   NETOPIA_SANDBOX_API_KEY   / NETOPIA_LIVE_API_KEY
//   NETOPIA_WEBHOOK_SECRET
//   NETOPIA_ENABLED
//   NETOPIA_MARKETPLACE_ENABLED

import type {
  PspAdapter,
  PspContext,
  PspIntentInput,
  PspIntentResult,
  PspPayoutStatus,
  PspWebhookEvent,
} from './contract';

export const NETOPIA_BASE = {
  sandbox: 'https://secure.sandbox.netopia-payments.com',
  live: 'https://secure.netopia-payments.com',
} as const;

// 2 RON in minor units (bani). Retained by HIR in MARKETPLACE mode.
const HIR_PLATFORM_FEE_BANI = 200;

/**
 * Checkout-session shape consumed by the storefront's provider-router.
 */
export type CheckoutSessionInput = {
  tenantId?: string;
  orderId: string;
  amountBani: number;
  currency: 'RON';
  successUrl: string;
  cancelUrl: string;
  notifyUrl?: string;
  customer: { email: string; firstName: string; phone: string };
  metadata?: Record<string, string>;
};

export type CheckoutSessionResult =
  | { ok: true; sessionId: string; url: string }
  | { ok: false; error: string; retry: boolean };

// Netopia v2 amounts are RON floats (not bani integers). Convert.
function baniToRon(bani: number): number {
  return Math.round(bani) / 100;
}

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function netopiaCreateIntent(
  ctx: PspContext,
  input: PspIntentInput,
): Promise<PspIntentResult> {
  const { credentials, log } = ctx;

  if (!credentials.signature || !credentials.apiKey) {
    return { ok: false, error: 'netopia_credentials_missing', retry: false };
  }

  if (credentials.mode === 'MARKETPLACE' && !credentials.subMerchantId) {
    return { ok: false, error: 'netopia_sub_merchant_id_required', retry: false };
  }

  const live = credentials.live;
  const base = live ? NETOPIA_BASE.live : NETOPIA_BASE.sandbox;
  const amountRon = baniToRon(input.amountBani);
  const hirFeeRon = baniToRon(input.hirFeeBani ?? HIR_PLATFORM_FEE_BANI);

  const orderPayload: Record<string, unknown> = {
    posSignature: credentials.signature,
    dateTime: new Date().toISOString().slice(0, 19),
    description: `Comanda HIR #${input.orderId.slice(0, 8)}`,
    orderID: input.orderId,
    amount: amountRon,
    currency: input.currency,
    billing: {
      email: input.customer.email,
      phone: input.customer.phone,
      firstName: input.customer.firstName,
      lastName: '',
      city: 'Brasov',
      country: 642, // Romania ISO 3166-1 numeric
      state: '',
      postalCode: '',
      details: '',
    },
  };

  // MARKETPLACE: route (amountRon - hirFeeRon) to the restaurant sub-merchant.
  // Netopia retains hirFeeRon for HIR (the platform) automatically.
  if (credentials.mode === 'MARKETPLACE' && credentials.subMerchantId) {
    const restaurantAmount = Math.round((amountRon - hirFeeRon) * 100) / 100;
    orderPayload['split'] = {
      destinations: [{ id: credentials.subMerchantId, amount: restaurantAmount }],
    };
  }

  const body = {
    config: {
      notifyUrl: input.notifyUrl,
      redirectUrl: input.returnUrl,
      language: 'ro',
      cancelUrl: input.returnUrl,
    },
    payment: {
      options: { installments: 0, bonus: 0 },
      instrument: { type: 'card' },
      data: {},
    },
    order: orderPayload,
  };

  log('info', 'netopia.createIntent posting', {
    orderId: input.orderId,
    amountRon,
    live,
    marketplace: credentials.mode === 'MARKETPLACE',
  });

  try {
    const res = await ctx.fetch(`${base}/payment/card`, {
      method: 'POST',
      headers: {
        // Netopia v2: API key passed directly (no "Bearer" prefix)
        Authorization: credentials.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      log('error', 'netopia.createIntent failed', { status: res.status, body: errText });
      return {
        ok: false,
        error: `netopia_api_failed:${res.status}`,
        retry: res.status >= 500,
      };
    }

    const data = (await res.json()) as {
      ntpID?: string;
      payment?: { ntpID?: string; status?: number; paymentURL?: string };
    };

    const paymentUrl = data.payment?.paymentURL;
    const ntpId = data.payment?.ntpID ?? data.ntpID ?? '';

    if (!paymentUrl) {
      log('error', 'netopia.createIntent missing paymentURL', { data });
      return { ok: false, error: 'netopia_missing_payment_url', retry: false };
    }

    log('info', 'netopia.createIntent ok', { ntpId, live });
    return { ok: true, providerRef: ntpId, redirectUrl: paymentUrl, raw: data };
  } catch (err) {
    log('error', 'netopia.createIntent exception', { err: String(err) });
    return { ok: false, error: 'netopia_exception', retry: true };
  }
}

async function netopiaVerifyWebhook(
  ctx: PspContext,
  rawBody: string,
  headers: Record<string, string>,
): Promise<PspWebhookEvent> {
  // Webhook secret is passed via credentials.webhookSecret (set by provider-router
  // from NETOPIA_WEBHOOK_SECRET env var). This keeps the adapter env-free.
  const webhookSecret = ctx.credentials.webhookSecret;
  if (!webhookSecret) return null;

  const sig = headers['x-netopia-signature'] ?? '';
  if (!sig) return null;

  const expected = await hmacSha256Hex(webhookSecret, rawBody);
  if (!safeEqual(expected, sig)) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }

  // Netopia v2 webhook payload shape:
  //   payment.ntpID   – provider reference
  //   payment.status  – 3=authorized 5=captured 6=cancelled/declined 7=refunded
  //   payment.amount  – RON float
  const payment = (payload['payment'] ?? {}) as Record<string, unknown>;
  const ntpId = String(payment['ntpID'] ?? '');
  const status = Number(payment['status'] ?? 0);
  const amountRon = Number(payment['amount'] ?? 0);
  const amountBani = Math.round(amountRon * 100);

  switch (status) {
    case 3:
      return { kind: 'payment.authorized', providerRef: ntpId, amountBani, eventId: ntpId };
    case 5:
      return { kind: 'payment.captured', providerRef: ntpId, amountBani, eventId: ntpId };
    case 6:
      return {
        kind: 'payment.failed',
        providerRef: ntpId,
        reason: 'cancelled_or_declined',
        eventId: ntpId,
      };
    case 7:
      return { kind: 'payment.refunded', providerRef: ntpId, amountBani, eventId: ntpId };
    default:
      return null;
  }
}

export const netopiaAdapter: PspAdapter = {
  providerKey: 'netopia',

  createIntent: netopiaCreateIntent,
  verifyWebhook: netopiaVerifyWebhook,

  async getPayoutStatus(_ctx: PspContext, _tenantId: string): Promise<PspPayoutStatus> {
    // Netopia does not expose a real-time balance API. Return zeros so
    // admin UI renders cleanly without throwing.
    return { pendingBani: 0, lastPayoutAt: null, nextPayoutAt: null };
  },

  async onboardingUrl(_ctx: PspContext, _tenantId: string): Promise<string | null> {
    // Netopia sub-merchant onboarding is manual (offline agreement per restaurant).
    // Admin UI falls back to the request-queue UX when this returns null.
    return null;
  },
};

/**
 * Checkout-session helper for the storefront's provider-router.
 * Bridges CheckoutSessionInput → PspIntentInput and delegates to netopiaAdapter.createIntent.
 */
export async function createNetopiaCheckoutSession(
  ctx: PspContext,
  input: CheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  const result = await netopiaAdapter.createIntent(ctx, {
    tenantId: input.tenantId ?? '',
    orderId: input.orderId,
    amountBani: input.amountBani,
    currency: input.currency,
    hirFeeBani: HIR_PLATFORM_FEE_BANI,
    customer: input.customer,
    returnUrl: input.successUrl,
    notifyUrl: input.notifyUrl ?? '',
  });

  if (!result.ok) {
    return { ok: false, error: result.error, retry: result.retry };
  }
  return { ok: true, sessionId: result.providerRef, url: result.redirectUrl };
}
