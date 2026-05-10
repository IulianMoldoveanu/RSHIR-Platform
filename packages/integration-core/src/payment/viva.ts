// HIR Restaurant Suite — Viva Wallet PSP adapter (stub).
//
// Iulian directive 2026-05-10: Viva is a PRIMARY marketplace target,
// alongside Netopia. Real implementation is blocked on commercial config.
// Until then this adapter throws a structured error so callers can surface
// "Coming soon" in the merchant UI without crashing.
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

const VIVA_NOT_CONFIGURED = 'VIVA_NOT_CONFIGURED — awaiting commercial config';

export const vivaAdapter: PspAdapter = {
  providerKey: 'viva',

  async createIntent(_ctx: PspContext, _input: PspIntentInput): Promise<PspIntentResult> {
    throw new Error(VIVA_NOT_CONFIGURED);
  },

  async verifyWebhook(
    _ctx: PspContext,
    _rawBody: string,
    _headers: Record<string, string>,
  ): Promise<PspWebhookEvent> {
    throw new Error(VIVA_NOT_CONFIGURED);
  },

  async getPayoutStatus(_ctx: PspContext, _tenantId: string): Promise<PspPayoutStatus> {
    throw new Error(VIVA_NOT_CONFIGURED);
  },

  async onboardingUrl(_ctx: PspContext, _tenantId: string): Promise<string | null> {
    throw new Error(VIVA_NOT_CONFIGURED);
  },
};
