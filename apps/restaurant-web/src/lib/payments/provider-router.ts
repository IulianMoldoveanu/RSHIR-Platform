import 'server-only';

// Thin adapter over `@hir/integration-core`'s PSP registry, exposing a
// stable `createCheckoutSession(...)` shape to the storefront's
// /api/checkout/intent route.
//
// Iulian directive 2026-05-16: Stripe is excluded; only Netopia and Viva
// are valid card providers. The router refuses any other key so a typo or
// stale tenant row fails loudly instead of silently routing to a missing
// adapter.
//
// Credentials lookup: V1 scaffold reads provider creds from env using a
// `<PROVIDER>_<MODE>_<FIELD>` convention. Once commercial config lands and
// Iulian wires per-tenant secrets through the Supabase Vault pattern from
// PR #379, swap `loadProviderCredentials` for the Vault adapter. Until then
// the env-only path is enough for sandbox smoke and lets us keep this PR's
// LOC budget tight.

import {
  type PaymentMode,
  type PaymentProvider,
} from '../payment-mode';
import {
  createNetopiaCheckoutSession,
  createVivaCheckoutSession,
  type CheckoutSessionInput,
  type CheckoutSessionResult,
  type PspContext,
  type PspCredentials,
} from '@hir/integration-core';

export type ProviderRouterInput = {
  orderId: string;
  amountBani: number;
  currency: 'RON';
  successUrl: string;
  cancelUrl: string;
  customer: { email: string; firstName: string; phone: string };
  metadata?: Record<string, string>;
  /** Tenant id — passed to MARKETPLACE split adapters for tracking. */
  tenantId?: string;
  /** Override PSP-to-server notification URL. Defaults to /api/webhooks/{provider}. */
  notifyUrl?: string;
};

export type ProviderRouterResult =
  | { ok: true; provider: PaymentProvider; sessionId: string; url: string }
  | { ok: false; provider: PaymentProvider; error: string };

/**
 * Resolve which checkout-session creator to call for a given tenant's
 * (provider, mode) tuple. Returns `null` when the combination is not
 * supported (e.g. unknown provider key from a stale tenant row).
 */
export function resolveProvider(
  provider: PaymentProvider,
  _mode: PaymentMode,
): ((ctx: PspContext, input: CheckoutSessionInput) => Promise<CheckoutSessionResult>) | null {
  if (provider === 'netopia') return createNetopiaCheckoutSession;
  if (provider === 'viva') return createVivaCheckoutSession;
  return null;
}

function loadProviderCredentials(
  provider: PaymentProvider,
  mode: PaymentMode,
  tenantId?: string,
): PspCredentials | null {
  // ENV convention: NETOPIA_SANDBOX_SIGNATURE / NETOPIA_SANDBOX_API_KEY,
  // NETOPIA_LIVE_SIGNATURE / NETOPIA_LIVE_API_KEY, and the same for VIVA_*.
  // When {PREFIX}_MARKETPLACE_ENABLED=true, reads sub-merchant id from
  // {PREFIX}_{ENV}_SUB_MERCHANT_ID (platform-wide fallback; per-tenant Vault
  // in V2 once commercial config lands — PR #379 pattern).
  const prefix = provider === 'netopia' ? 'NETOPIA' : 'VIVA';
  const env = mode === 'card_live' ? 'LIVE' : 'SANDBOX';
  const signature = process.env[`${prefix}_${env}_SIGNATURE`];
  const apiKey = process.env[`${prefix}_${env}_API_KEY`];
  if (!signature || !apiKey) return null;

  const webhookSecret =
    process.env[`${prefix}_WEBHOOK_SECRET`] ??
    process.env[`${prefix}_WEBHOOK_KEY`] ??
    undefined;
  const sourceCode = process.env[`${prefix}_${env}_SOURCE_CODE`] ?? undefined;

  const marketplaceEnabled = process.env[`${prefix}_MARKETPLACE_ENABLED`] === 'true';
  if (marketplaceEnabled) {
    // Sub-merchant id: env fallback until per-tenant Vault wired in V2.
    // `tenantId` is passed for future Vault lookup keyed by tenant.
    void tenantId;
    const subMerchantId = process.env[`${prefix}_${env}_SUB_MERCHANT_ID`] ?? undefined;
    return {
      mode: 'MARKETPLACE',
      signature,
      apiKey,
      subMerchantId,
      webhookSecret,
      sourceCode,
      live: mode === 'card_live',
    };
  }

  return {
    mode: 'STANDARD',
    signature,
    apiKey,
    webhookSecret,
    sourceCode,
    live: mode === 'card_live',
  };
}

function makeCtx(credentials: PspCredentials): PspContext {
  return {
    credentials,
    fetch: globalThis.fetch.bind(globalThis),
    log: (level, msg, meta) => {
      // Lightweight logger — provider-router output is rarely the root
      // cause of an order failure, so info-level lives at console.info.
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
      fn(`[provider-router] ${msg}`, meta ?? {});
    },
  };
}

/**
 * Storefront's single entry point for "create a hosted checkout session for
 * this order". Picks the right adapter, builds credentials/context, returns
 * the redirect URL the client should `window.location.href` to.
 */
export async function createCheckoutSession(
  provider: PaymentProvider,
  mode: PaymentMode,
  input: ProviderRouterInput,
): Promise<ProviderRouterResult> {
  const adapter = resolveProvider(provider, mode);
  if (!adapter) {
    return { ok: false, provider, error: 'provider_not_supported' };
  }
  const credentials = loadProviderCredentials(provider, mode, input.tenantId);
  if (!credentials) {
    return { ok: false, provider, error: 'provider_credentials_missing' };
  }
  const ctx = makeCtx(credentials);
  const result = await adapter(ctx, {
    tenantId: input.tenantId,
    orderId: input.orderId,
    amountBani: input.amountBani,
    currency: input.currency,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    notifyUrl: input.notifyUrl,
    customer: input.customer,
    metadata: input.metadata,
  });
  if (!result.ok) {
    return { ok: false, provider, error: result.error };
  }
  return { ok: true, provider, sessionId: result.sessionId, url: result.url };
}
