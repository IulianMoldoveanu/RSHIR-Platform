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
): PspCredentials | null {
  // ENV convention: NETOPIA_SANDBOX_SIGNATURE / NETOPIA_SANDBOX_API_KEY,
  // NETOPIA_LIVE_SIGNATURE / NETOPIA_LIVE_API_KEY, and the same for VIVA_*.
  // Per the existing Vault pattern (PR #379) these env reads are the
  // fallback path; per-tenant Vault secrets win when wired in V2.
  const prefix = provider === 'netopia' ? 'NETOPIA' : 'VIVA';
  const env = mode === 'card_live' ? 'LIVE' : 'SANDBOX';
  const signature = process.env[`${prefix}_${env}_SIGNATURE`];
  const apiKey = process.env[`${prefix}_${env}_API_KEY`];
  if (!signature || !apiKey) return null;
  return {
    mode: 'STANDARD',
    signature,
    apiKey,
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
  const credentials = loadProviderCredentials(provider, mode);
  if (!credentials) {
    return { ok: false, provider, error: 'provider_credentials_missing' };
  }
  const ctx = makeCtx(credentials);
  const result = await adapter(ctx, {
    orderId: input.orderId,
    amountBani: input.amountBani,
    currency: input.currency,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    customer: input.customer,
    metadata: input.metadata,
  });
  if (!result.ok) {
    return { ok: false, provider, error: result.error };
  }
  return { ok: true, provider, sessionId: result.sessionId, url: result.url };
}
