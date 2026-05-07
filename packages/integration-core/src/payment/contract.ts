// HIR Restaurant Suite — Payment Service Provider (PSP) adapter contract.
// Separate from the POS integration contract in `../contract.ts` because
// the shape of the work is fundamentally different (intent → capture →
// refund → webhook reconciliation, vs POS push/pull).
//
// First adapter: Netopia (RO). Future: Viva, Stripe (already wired
// directly in restaurant-web; will be wrapped behind this contract once a
// second non-Stripe provider lands).

export type PspProviderKey = 'netopia';

/**
 * Operating mode per tenant. Picked at onboarding.
 *
 * - MARKETPLACE — HIR is master merchant on Netopia, tenants are
 *   sub-merchants. Split payment automated. Requires Netopia commercial
 *   agreement.
 * - STANDARD — Each tenant has its own Netopia merchant credentials. HIR
 *   dispatches per-tenant payment intents only; commission collected via
 *   a separate billing run. Works with no partnership at all.
 */
export type PspMode = 'MARKETPLACE' | 'STANDARD';

export type PspCredentials = {
  mode: PspMode;
  /** Netopia signature (merchant id). Required in both modes. */
  signature: string;
  /**
   * Decrypted API key. Loaded server-side from psp_credentials.api_key_encrypted
   * via the admin client. Never echoed to the merchant UI.
   */
  apiKey: string;
  /** MARKETPLACE only. Per-tenant sub-merchant id assigned by Netopia. */
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
  /** Where Netopia redirects the customer after card authorization. */
  returnUrl: string;
  /** Netopia server-to-server webhook target. */
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
}
