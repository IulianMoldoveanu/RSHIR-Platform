// HIR Restaurant Suite — Netopia PSP adapter (V1 scaffold).
//
// Supports both operating modes per Iulian 2026-05-07:
//   MARKETPLACE — HIR is master merchant, sub-merchants per tenant
//   STANDARD    — Each tenant has its own Netopia merchant credentials
//
// One code path with mode-flag. Both modes share request signing,
// webhook verification, and the response shape we return upstream.
//
// V1 scope: scaffold only. Real Netopia API endpoints + payload format
// land in V2 once Iulian confirms the exact sandbox URL via WebFetch
// (per CEO directive — do not guess endpoints).
//
// Default-off behind NETOPIA_ENABLED feature flag at the route layer.

import type {
  PspAdapter,
  PspContext,
  PspIntentInput,
  PspIntentResult,
  PspWebhookEvent,
} from './contract';

// Netopia sandbox + live base URLs. Confirmed values pending WebFetch
// against netopia-payments.com docs. Until then, callers MUST treat any
// HTTP attempt as "not configured" and the route layer keeps the feature
// flag off.
const NETOPIA_BASE = {
  sandbox: 'https://secure.sandbox.netopia-payments.com',
  live: 'https://secure.netopia-payments.com',
} as const;

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
};
