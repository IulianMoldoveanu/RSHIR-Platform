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
// Credentials lookup: V2 (this file) checks psp_credentials for a per-tenant
// active row. If found, reads api_key + signature_key + source_code from
// Supabase Vault via hir_read_vault_secret. If no row, falls back to env vars
// (V1 behavior) with a warning. Vault name convention:
//   psp_<provider>_<tenantId>_api_key
//   psp_<provider>_<tenantId>_signature_key
//   psp_<provider>_<tenantId>_source_code

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
import { getSupabaseAdmin } from '../supabase-admin';

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

// ─── Vault name helpers ──────────────────────────────────────────────────────

/** Stable vault secret name for a given provider + tenant + field. */
export function pspVaultName(
  provider: PaymentProvider,
  tenantId: string,
  field: 'api_key' | 'signature_key' | 'source_code',
): string {
  return `psp_${provider}_${tenantId}_${field}`;
}

// ─── DB + Vault lookup ───────────────────────────────────────────────────────

type PspCredRow = {
  mode: string;
  signature: string | null;
  sub_merchant_id: string | null;
  api_key_vault_name: string | null;
  live: boolean;
};

async function readVaultSecret(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  secretName: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc('hir_read_vault_secret', {
    secret_name: secretName,
  });
  if (error) {
    console.warn(`[provider-router] vault read failed (${secretName}): ${error.message}`);
    return null;
  }
  return (data as string | null) ?? null;
}

async function loadFromDb(
  tenantId: string,
  provider: PaymentProvider,
  mode: PaymentMode,
): Promise<PspCredentials | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getSupabaseAdmin() as any;

  const { data: row, error } = await admin
    .from('psp_credentials')
    .select('mode, signature, sub_merchant_id, api_key_vault_name, live')
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    console.warn(
      `[provider-router] psp_credentials lookup failed for tenant ${tenantId}: ${error.message}`,
    );
    return null;
  }
  if (!row) return null;

  const r = row as PspCredRow;

  // api_key: prefer vault name stored on the row, fall back to conventional name.
  const apiKeyVaultName =
    r.api_key_vault_name ?? pspVaultName(provider, tenantId, 'api_key');
  const apiKey = await readVaultSecret(admin, apiKeyVaultName);

  const sigKeyVaultName = pspVaultName(provider, tenantId, 'signature_key');
  const signature =
    (await readVaultSecret(admin, sigKeyVaultName)) ?? r.signature ?? null;

  const sourceCodeVaultName = pspVaultName(provider, tenantId, 'source_code');
  const sourceCode = (await readVaultSecret(admin, sourceCodeVaultName)) ?? undefined;

  if (!signature || !apiKey) {
    console.warn(
      `[provider-router] tenant ${tenantId} has psp_credentials row but vault secrets are incomplete — api_key or signature_key missing`,
    );
    return null;
  }

  const live = mode === 'card_live';

  if (r.mode === 'MARKETPLACE') {
    return {
      mode: 'MARKETPLACE',
      signature,
      apiKey,
      subMerchantId: r.sub_merchant_id ?? undefined,
      sourceCode,
      live,
    };
  }

  return {
    mode: 'STANDARD',
    signature,
    apiKey,
    sourceCode,
    live,
  };
}

// ─── Env fallback (V1 behavior) ──────────────────────────────────────────────

function loadFromEnv(
  provider: PaymentProvider,
  mode: PaymentMode,
  tenantId: string | undefined,
): PspCredentials | null {
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
  const live = mode === 'card_live';

  const marketplaceEnabled = process.env[`${prefix}_MARKETPLACE_ENABLED`] === 'true';
  if (marketplaceEnabled) {
    void tenantId;
    const subMerchantId = process.env[`${prefix}_${env}_SUB_MERCHANT_ID`] ?? undefined;
    return {
      mode: 'MARKETPLACE',
      signature,
      apiKey,
      subMerchantId,
      webhookSecret,
      sourceCode,
      live,
    };
  }

  return {
    mode: 'STANDARD',
    signature,
    apiKey,
    webhookSecret,
    sourceCode,
    live,
  };
}

// ─── Combined loader (exported for tests) ────────────────────────────────────

/**
 * Resolve PSP credentials for a (tenantId, provider, mode) triple.
 *
 * Priority:
 *  1. Per-tenant row in psp_credentials + Supabase Vault secrets
 *  2. Platform-wide env vars with a console.warn (shared fallback)
 *
 * Returns `null` when neither source yields usable credentials.
 */
export async function loadProviderCredentials(
  tenantId: string | undefined,
  provider: PaymentProvider,
  mode: PaymentMode,
): Promise<PspCredentials | null> {
  if (tenantId) {
    const dbCreds = await loadFromDb(tenantId, provider, mode);
    if (dbCreds) return dbCreds;
  }

  // Fallback path — warn but do not throw so existing env-only deployments
  // keep working.
  console.warn(
    `[provider-router] tenant ${tenantId ?? '<unknown>'} using shared credentials — admin should configure per-tenant PSP credentials`,
  );
  return loadFromEnv(provider, mode, tenantId);
}

// ─── Context builder ─────────────────────────────────────────────────────────

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

// ─── Public entry point ──────────────────────────────────────────────────────

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
  const credentials = await loadProviderCredentials(input.tenantId, provider, mode);
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
