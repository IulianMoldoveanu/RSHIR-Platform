// HIR Restaurant Suite — Netopia PSP adapter.
//
// Supports both operating modes per Iulian 2026-05-07:
//   MARKETPLACE — HIR is master merchant, sub-merchants per tenant
//   STANDARD    — Each tenant has its own Netopia merchant credentials
//
// V1 (scaffold) — Real Netopia API endpoints + payload format land in V2
// once Iulian confirms the exact sandbox URL via WebFetch (per CEO directive
// — do not guess endpoints). In sandbox-credentials mode we return a
// well-formed sandbox redirect URL so storefront can exercise the flow end
// to end without making any HTTP calls.
//
// Iulian directive 2026-05-16: Stripe is excluded; Netopia is one of the
// two surviving providers (alongside Viva). The thin `createCheckoutSession`
// helper exposed below is what the restaurant-web app router talks to.
//
// Default-off behind NETOPIA_ENABLED feature flag at the route layer.

import type {
  PspAdapter,
  PspContext,
  PspIntentInput,
  PspIntentResult,
  PspPayoutStatus,
  PspWebhookEvent,
} from './contract';

// Netopia sandbox + live base URLs. Confirmed values pending WebFetch
// against netopia-payments.com docs. Until then, callers MUST treat any
// HTTP attempt as "not configured" and the route layer keeps the feature
// flag off.
export const NETOPIA_BASE = {
  sandbox: 'https://secure.sandbox.netopia-payments.com',
  live: 'https://secure.netopia-payments.com',
} as const;

/**
 * Minimal checkout-session shape consumed by the storefront. Matches the
 * abstraction surfaced by `apps/restaurant-web/src/lib/payments/provider-router.ts`.
 */
export type CheckoutSessionInput = {
  orderId: string;
  amountBani: number;
  currency: 'RON';
  successUrl: string;
  cancelUrl: string;
  customer: { email: string; firstName: string; phone: string };
  metadata?: Record<string, string>;
};

export type CheckoutSessionResult =
  | { ok: true; sessionId: string; url: string }
  | { ok: false; error: string; retry: boolean };

export const netopiaAdapter: PspAdapter = {
  providerKey: 'netopia',

  async createIntent(ctx: PspContext, input: PspIntentInput): Promise<PspIntentResult> {
    const { credentials, log } = ctx;

    if (!credentials.signature || !credentials.apiKey) {
      return { ok: false, error: 'credentials_missing', retry: false };
    }

    if (credentials.mode === 'MARKETPLACE' && !credentials.subMerchantId) {
      return { ok: false, error: 'sub_merchant_id_required_in_marketplace_mode', retry: false };
    }

    // V1: scaffold returns a structured "not_implemented" so the calling
    // route can 503 cleanly rather than silently succeed. Real signing +
    // POST lands in V2 once endpoint shape is confirmed.
    log('info', 'netopia.createIntent scaffold called', {
      mode: credentials.mode,
      orderId: input.orderId,
      amountBani: input.amountBani,
      live: credentials.live,
      base: credentials.live ? NETOPIA_BASE.live : NETOPIA_BASE.sandbox,
    });

    return {
      ok: false,
      error: 'netopia_adapter_v1_scaffold_only',
      retry: false,
    };
  },

  async verifyWebhook(
    ctx: PspContext,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<PspWebhookEvent> {
    const { log } = ctx;

    // V1 scaffold: we accept the body shape (JSON) but do not yet verify
    // the Netopia HMAC signature. The route layer guards this with the
    // NETOPIA_ENABLED feature flag — until V2 ships real signature
    // verification, the webhook endpoint stays 503 in production.
    log('info', 'netopia.verifyWebhook scaffold called', {
      bodyLen: rawBody.length,
      hasSignature: Boolean(headers['x-netopia-signature']),
    });

    return null;
  },

  // V2 wires real Netopia balance + payout schedule once commercial config
  // arrives. Until then return zeros so admin UI renders without throwing.
  async getPayoutStatus(_ctx: PspContext, _tenantId: string): Promise<PspPayoutStatus> {
    return { pendingBani: 0, lastPayoutAt: null, nextPayoutAt: null };
  },

  // Netopia onboarding is handled via the platform-admin queue (manual
  // approval after Iulian closes commercial agreement). Return null so the
  // admin UI defers to the existing request-queue UX.
  async onboardingUrl(_ctx: PspContext, _tenantId: string): Promise<string | null> {
    return null;
  },
};

/**
 * Checkout-session helper for the storefront's intent route. Lives next to
 * the adapter so the URL shape stays consistent with the V2 real handler
 * once it lands.
 *
 * V1: sandbox returns a synthetic redirect URL pointing at the Netopia
 * sandbox host with the order id as the reference. Live mode is gated to
 * `credentials_missing` until commercial config arrives — the route layer
 * will surface that to the storefront so it can fall back to COD.
 */
export async function createNetopiaCheckoutSession(
  ctx: PspContext,
  input: CheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  const { credentials, log } = ctx;
  if (!credentials.apiKey || !credentials.signature) {
    return { ok: false, error: 'netopia_credentials_missing', retry: false };
  }
  const base = credentials.live ? NETOPIA_BASE.live : NETOPIA_BASE.sandbox;
  const sessionId = `np_${input.orderId}`;

  log('info', 'netopia.createCheckoutSession scaffold called', {
    orderId: input.orderId,
    amountBani: input.amountBani,
    live: credentials.live,
    base,
  });

  if (credentials.live) {
    // Live POST signing not implemented yet (V2). Refuse rather than fake.
    return { ok: false, error: 'netopia_live_not_implemented', retry: false };
  }

  // Sandbox: deterministic URL so smoke tests can grep for it. The real
  // Netopia sandbox returns its own redirect after the POST to /payment/card;
  // until V2 wires that POST, we hand back a URL that ops can recognise as
  // a scaffolded sandbox response.
  const url =
    `${base}/payment/card/start?ref=${encodeURIComponent(sessionId)}` +
    `&amount=${input.amountBani}&currency=${input.currency}` +
    `&return=${encodeURIComponent(input.successUrl)}` +
    `&cancel=${encodeURIComponent(input.cancelUrl)}`;

  return { ok: true, sessionId, url };
}
