// HIR Restaurant Suite — Viva Wallet PSP adapter (scaffold).
//
// Iulian directive 2026-05-10: Viva is a PRIMARY marketplace target,
// alongside Netopia. Iulian directive 2026-05-16: Stripe is excluded and
// Viva is one of the two surviving providers. Real implementation is
// blocked on commercial config; until then this adapter still hands back a
// well-formed sandbox redirect URL so storefront can exercise the flow end
// to end without making any HTTP calls.
//
// V2 implementation TODO (mirrors Netopia structure):
//   - POST /checkout/v2/orders → returns orderCode + redirect URL
//     (smart-checkout.vivapayments.com/web/checkout?ref=<orderCode>)
//   - Webhook verification: HMAC-SHA256 on raw body with merchant API key,
//     signature in `Authorization` or `x-api-signature` header.
//   - getPayoutStatus: GET /merchants/v1/balance (connected merchant)
//   - onboardingUrl: Viva exposes a partner onboarding link; until commercial
//     config lands we return null and use the platform-admin queue pattern.

import type {
  PspAdapter,
  PspContext,
  PspIntentInput,
  PspIntentResult,
  PspPayoutStatus,
  PspWebhookEvent,
} from './contract';
import type { CheckoutSessionInput, CheckoutSessionResult } from './netopia';

export const VIVA_BASE = {
  sandbox: 'https://demo.vivapayments.com',
  live: 'https://www.vivapayments.com',
} as const;

const VIVA_NOT_CONFIGURED = 'VIVA_NOT_CONFIGURED — awaiting commercial config';

export const vivaAdapter: PspAdapter = {
  providerKey: 'viva',

  async createIntent(_ctx: PspContext, _input: PspIntentInput): Promise<PspIntentResult> {
    return { ok: false, error: VIVA_NOT_CONFIGURED, retry: false };
  },

  async verifyWebhook(
    _ctx: PspContext,
    _rawBody: string,
    _headers: Record<string, string>,
  ): Promise<PspWebhookEvent> {
    return null;
  },

  async getPayoutStatus(_ctx: PspContext, _tenantId: string): Promise<PspPayoutStatus> {
    return { pendingBani: 0, lastPayoutAt: null, nextPayoutAt: null };
  },

  async onboardingUrl(_ctx: PspContext, _tenantId: string): Promise<string | null> {
    return null;
  },
};

/**
 * Checkout-session helper for the storefront's intent route. Symmetric with
 * `createNetopiaCheckoutSession` so the storefront router can call either
 * adapter through a single shape. V1 sandbox returns a synthetic redirect;
 * live mode refuses until V2 wires the POST /checkout/v2/orders call.
 */
export async function createVivaCheckoutSession(
  ctx: PspContext,
  input: CheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  const { credentials, log } = ctx;
  if (!credentials.apiKey || !credentials.signature) {
    return { ok: false, error: 'viva_credentials_missing', retry: false };
  }
  const base = credentials.live ? VIVA_BASE.live : VIVA_BASE.sandbox;
  const sessionId = `vv_${input.orderId}`;

  log('info', 'viva.createCheckoutSession scaffold called', {
    orderId: input.orderId,
    amountBani: input.amountBani,
    live: credentials.live,
    base,
  });

  if (credentials.live) {
    return { ok: false, error: 'viva_live_not_implemented', retry: false };
  }

  const url =
    `${base}/web/checkout?ref=${encodeURIComponent(sessionId)}` +
    `&amount=${input.amountBani}&currency=${input.currency}` +
    `&return=${encodeURIComponent(input.successUrl)}` +
    `&cancel=${encodeURIComponent(input.cancelUrl)}`;

  return { ok: true, sessionId, url };
}
