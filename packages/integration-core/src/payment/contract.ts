// HIR Restaurant Suite — Payment Service Provider (PSP) adapter contract.
// Separate from the POS integration contract in `../contract.ts` because
// the shape of the work is fundamentally different (intent → capture →
// refund → webhook reconciliation, vs POS push/pull).
//
// Active gateways (Lane PSP-MULTIGATES-V1, updated 2026-05-16):
//   - 'netopia' — RO marketplace primary; commercial config pending
//   - 'viva'    — RO marketplace alternative; awaiting commercial config
//
// Stripe Connect excluded per Iulian directive 2026-05-16. The adapter file
// is preserved in _archived/ for historical reference; do not re-import.
// Historic tenant rows that stored 'stripe_connect' in psp_credentials are
// handled at runtime by getPspAdapter throwing — no active tenants used it.

export type PspProviderKey = 'netopia' | 'viva';

/**
 * Operating mode per tenant. Picked at onboarding.
 *
 * - MARKETPLACE — HIR is master merchant on the gateway, tenants are
 *   sub-merchants. Split payment automated. Requires commercial agreement
 *   with the gateway (Netopia/Viva/Stripe Connect).
 * - STANDARD — Each tenant has its own merchant credentials. HIR
 *   dispatches per-tenant payment intents only; commission collected via
 *   a separate billing run. Works with no partnership at all.
 */
export type PspMode = 'MARKETPLACE' | 'STANDARD';

export type PspCredentials = {
  mode: PspMode;
  /**
   * Provider-specific merchant identifier.
   *   - Netopia: posSignature (merchant id)
   *   - Viva: OAuth2 clientId (= merchant id)
   * Required in both modes.
   */
  signature: string;
  /**
   * Decrypted API key / OAuth2 client secret.
   * Loaded server-side from env or Vault — never echoed to the UI.
   * Also overloaded as the webhook verification secret in `verifyWebhook`
   * calls (Netopia + Viva adapters follow this same pattern).
   */
  apiKey: string;
  /**
   * MARKETPLACE only. Per-tenant sub-merchant id assigned by the gateway.
   *   - Netopia: SELLER_ACCOUNT_ID
   *   - Viva: connected account id
   */
  subMerchantId?: string;
  live: boolean;
  /**
   * Shared secret for incoming webhook HMAC / Bearer verification.
   * Populated by the route layer from env (NETOPIA_WEBHOOK_SECRET /
   * VIVA_WEBHOOK_KEY) so adapters never read process.env directly.
   */
  webhookSecret?: string;
  /**
   * Viva-specific payment source code (configured in Viva dashboard).
   * Populated by the route layer from VIVA_{SANDBOX|LIVE}_SOURCE_CODE.
   */
  sourceCode?: string;
};

export type PspIntentInput = {
  tenantId: string;
  orderId: string;
  amountBani: number;
  currency: 'RON';
  /** MARKETPLACE only. HIR commission slice in bani for the split run. */
  hirFeeBani?: number;
  customer: {
    email: string;
    firstName: string;
    phone: string;
  };
  /** Where the gateway redirects the customer after card authorization. */
  returnUrl: string;
  /** Server-to-server webhook target for the gateway. */
  notifyUrl: string;
};

export type PspIntentResult =
  | {
      ok: true;
      providerRef: string;
      /** URL to redirect the customer to for card authorization. */
      redirectUrl: string;
      raw: unknown;
    }
  | { ok: false; error: string; retry: boolean };

export type PspWebhookEvent =
  | {
      kind: 'payment.authorized';
      providerRef: string;
      amountBani: number;
      eventId: string;
    }
  | {
      kind: 'payment.captured';
      providerRef: string;
      amountBani: number;
      eventId: string;
    }
  | {
      kind: 'payment.failed';
      providerRef: string;
      reason: string;
      eventId: string;
    }
  | {
      kind: 'payment.refunded';
      providerRef: string;
      amountBani: number;
      eventId: string;
    }
  | null;

export type PspContext = {
  credentials: PspCredentials;
  fetch: typeof fetch;
  log: (level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
};

/**
 * Per-tenant payout status snapshot. Polled by admin UI; not used in the
 * critical path. Numbers are minor-units (bani for RON, cents for
 * cross-currency; gateway-native).
 */
export type PspPayoutStatus = {
  /** Funds held by the gateway, not yet paid out to the merchant. */
  pendingBani: number;
  /** Most recent successful payout, or null if none yet. */
  lastPayoutAt: Date | null;
  /** Next scheduled payout, or null if not predictable. */
  nextPayoutAt: Date | null;
};

export interface PspAdapter {
  readonly providerKey: PspProviderKey;

  /** Create a payment intent and return the redirect URL. */
  createIntent(ctx: PspContext, input: PspIntentInput): Promise<PspIntentResult>;

  /** Verify and parse an inbound webhook from the PSP. */
  verifyWebhook(
    ctx: PspContext,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<PspWebhookEvent>;

  /**
   * Read pending balance + payout schedule for a tenant. Returns zeros /
   * nulls when not configured or unsupported by the gateway.
   */
  getPayoutStatus(ctx: PspContext, tenantId: string): Promise<PspPayoutStatus>;

  /**
   * Onboarding redirect URL for KYC, when the gateway exposes a self-serve
   * flow. Returns `null` when onboarding is request-queue-gated (e.g. the
   * existing `stripe_onboarding_requests` human-approval flow). Callers MUST
   * fall back to the request-queue UX when this returns null.
   */
  onboardingUrl(ctx: PspContext, tenantId: string): Promise<string | null>;
}
