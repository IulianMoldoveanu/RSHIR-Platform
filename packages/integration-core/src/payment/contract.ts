// HIR Restaurant Suite — Payment Service Provider (PSP) adapter contract.
// Separate from the POS integration contract in `../contract.ts` because
// the shape of the work is fundamentally different (intent → capture →
// refund → webhook reconciliation, vs POS push/pull).
//
// Multi-gateway support (Lane PSP-MULTIGATES-V1, 2026-05-10):
//   - 'netopia'        — RO marketplace primary; commercial config pending
//   - 'stripe_connect' — fallback/demo only, request-queue-gated onboarding
//   - 'viva'           — RO marketplace alternative; awaiting commercial config
//
// Iulian directive 2026-05-10: "implement only PSP abstraction and split-
// payment-ready architecture. Stripe Connect is fallback/demo only.
// Primary target remains Viva/Netopia marketplace once commercial config
// arrives."

export type PspProviderKey = 'netopia' | 'stripe_connect' | 'viva';

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
   *   - Netopia: signature (merchant id)
   *   - Stripe Connect: platform account id (read from env, not per-tenant)
   *   - Viva: merchant id
   * Required in both modes.
   */
  signature: string;
  /**
   * Decrypted API key. Loaded server-side from Vault (per-tenant secret name)
   * via the admin client. Never echoed to the merchant UI.
   * For Stripe Connect this is the platform-level secret key (sk_test_* /
   * sk_live_*), read from env at the route layer — not stored per-tenant.
   */
  apiKey: string;
  /**
   * MARKETPLACE only. Per-tenant sub-merchant id assigned by the gateway.
   *   - Netopia: sub-merchant id
   *   - Stripe Connect: connected account id (acct_*)
   *   - Viva: child merchant id
   */
  subMerchantId?: string;
  live: boolean;
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
