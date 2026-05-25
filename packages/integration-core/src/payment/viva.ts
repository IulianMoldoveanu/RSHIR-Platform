// HIR Restaurant Suite — Viva Wallet PSP adapter (V2 Marketplace).
//
// Research findings (2026-05-25):
//   - Viva Marketplace API is fully productised; HIR = master merchant,
//     restaurants = connected accounts (sub-merchants).
//   - Split happens at SETTLEMENT (T+1), not at card-swipe instant.
//     The customer sees a single charge; Viva distributes in background.
//   - `commissionAmount` (minor units = bani for RON) is retained by HIR;
//     the rest flows to the connected account automatically.
//   - Sub-merchant KYC is handled by Viva (digital eKYB).
//   - Onboarding requires a Marketplace framework agreement with Viva:
//     https://developer.viva.com/marketplaces/
//
// Credential mapping (PspCredentials fields):
//   signature      → Viva OAuth2 clientId (= merchant id)
//   apiKey         → Viva OAuth2 clientSecret
//   subMerchantId  → Viva connected account id (assigned after onboarding)
//   sourceCode     → Viva payment source code (from Viva dashboard)
//   webhookSecret  → VIVA_WEBHOOK_KEY (for webhook Authorization check)
//
// Env vars read by provider-router.ts (NOT read here — adapters stay env-free):
//   VIVA_SANDBOX_SIGNATURE / VIVA_LIVE_SIGNATURE
//   VIVA_SANDBOX_API_KEY   / VIVA_LIVE_API_KEY
//   VIVA_SANDBOX_SOURCE_CODE / VIVA_LIVE_SOURCE_CODE
//   VIVA_WEBHOOK_KEY
//   VIVA_MARKETPLACE_ENABLED
//   VIVA_ENABLED

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

// 2 RON in minor units (bani). Retained by HIR in MARKETPLACE mode.
const HIR_PLATFORM_FEE_BANI = 200;

// In-process OAuth2 token cache. Serverless: each cold start starts fresh.
let _tokenCache: { token: string; expiresAt: number; live: boolean } | null = null;

async function fetchVivaToken(ctx: PspContext, live: boolean): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.live === live && now < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }
  const { credentials } = ctx;
  const base = live ? VIVA_BASE.live : VIVA_BASE.sandbox;
  // btoa is available in DOM types (lib: ["ES2022", "DOM"])
  const encoded = btoa(`${credentials.signature}:${credentials.apiKey}`);
  const res = await ctx.fetch(`${base}/connect/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`viva_token_failed:${res.status} ${body}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  _tokenCache = {
    token: data.access_token,
    live,
    // Refresh 60s before expiry to avoid races
    expiresAt: now + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Constant-time string comparison (no timing oracle for equal-length strings).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function vivaCreateIntent(ctx: PspContext, input: PspIntentInput): Promise<PspIntentResult> {
  const { credentials, log } = ctx;
  if (!credentials.signature || !credentials.apiKey) {
    return { ok: false, error: 'viva_credentials_missing', retry: false };
  }

  const live = credentials.live;
  const base = live ? VIVA_BASE.live : VIVA_BASE.sandbox;

  try {
    const token = await fetchVivaToken(ctx, live);
    const hirFee = input.hirFeeBani ?? HIR_PLATFORM_FEE_BANI;

    const body: Record<string, unknown> = {
      amount: input.amountBani,
      currencyCode: input.currency,
      customerTrns: `Comanda #${input.orderId.slice(0, 8)}`,
      merchantTrns: `${input.tenantId}:${input.orderId}`,
      paymentTimeout: 300,
      preauth: false,
      allowRecurring: false,
      maxInstallments: 0,
      customer: {
        email: input.customer.email,
        fullName: input.customer.firstName,
        phone: input.customer.phone,
        requestLang: 'ro-RO',
        countryCode: 'RO',
      },
    };

    if (credentials.sourceCode) body.sourceCode = credentials.sourceCode;

    if (credentials.mode === 'MARKETPLACE') {
      // commissionAmount (bani) retained by HIR; remainder goes to connected account.
      body.commissionAmount = hirFee;
      if (credentials.subMerchantId) {
        body.connectedAccount = credentials.subMerchantId;
      }
    }

    const res = await ctx.fetch(`${base}/checkout/v2/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      log('error', 'viva.createIntent order failed', { status: res.status, body: errText });
      return {
        ok: false,
        error: `viva_order_failed:${res.status}`,
        retry: res.status >= 500,
      };
    }

    const data = (await res.json()) as { orderCode: number };
    const orderCode = String(data.orderCode);
    const redirectUrl = `${base}/web/checkout?ref=${orderCode}`;

    log('info', 'viva.createIntent ok', {
      orderCode,
      live,
      marketplace: credentials.mode === 'MARKETPLACE',
    });
    return { ok: true, providerRef: orderCode, redirectUrl, raw: data };
  } catch (err) {
    log('error', 'viva.createIntent exception', { err: String(err) });
    return { ok: false, error: 'viva_exception', retry: true };
  }
}

async function vivaVerifyWebhook(
  ctx: PspContext,
  rawBody: string,
  headers: Record<string, string>,
): Promise<PspWebhookEvent> {
  // Webhook key is passed via credentials.webhookSecret (set by provider-router
  // from VIVA_WEBHOOK_KEY env var). This keeps the adapter env-free.
  const webhookKey = ctx.credentials.webhookSecret;
  if (!webhookKey) return null;

  // Primary: Viva sends Authorization: Bearer {webhookKey}
  const authHeader = headers['authorization'] ?? '';
  const bearerKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  let verified = safeEqual(bearerKey, webhookKey);

  // Fallback: HMAC-SHA256 in x-viva-signature (some Viva webhook configs use this)
  if (!verified) {
    const sig = headers['x-viva-signature'] ?? '';
    if (sig) {
      const expected = await hmacSha256Hex(webhookKey, rawBody);
      verified = safeEqual(expected, sig);
    }
  }

  if (!verified) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }

  // Viva EventTypeId reference (most common):
  //   1796 = Transaction Payment Created (success / captured)
  //   1798 = Transaction Failed
  //   1797 = Transaction Reversed (refund)
  const eventType = Number(payload['EventTypeId'] ?? 0);
  const eventData = (payload['EventData'] ?? {}) as Record<string, unknown>;
  const transactionId = String(eventData['TransactionId'] ?? '');
  const amount = Number(eventData['Amount'] ?? 0);

  switch (eventType) {
    case 1796:
      return {
        kind: 'payment.captured',
        providerRef: transactionId,
        amountBani: Math.round(amount),
        eventId: transactionId,
      };
    case 1798:
      return {
        kind: 'payment.failed',
        providerRef: transactionId,
        reason: String(eventData['StatusId'] ?? 'unknown'),
        eventId: transactionId,
      };
    case 1797:
      return {
        kind: 'payment.refunded',
        providerRef: transactionId,
        amountBani: Math.round(amount),
        eventId: transactionId,
      };
    default:
      return null;
  }
}

async function vivaGetPayoutStatus(ctx: PspContext, _tenantId: string): Promise<PspPayoutStatus> {
  const { credentials, log } = ctx;
  if (!credentials.signature || !credentials.apiKey || !credentials.subMerchantId) {
    return { pendingBani: 0, lastPayoutAt: null, nextPayoutAt: null };
  }
  const live = credentials.live;
  const base = live ? VIVA_BASE.live : VIVA_BASE.sandbox;
  try {
    const token = await fetchVivaToken(ctx, live);
    const res = await ctx.fetch(
      `${base}/api/accounts/${encodeURIComponent(credentials.subMerchantId)}/balance`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return { pendingBani: 0, lastPayoutAt: null, nextPayoutAt: null };
    const data = (await res.json()) as { balance?: number; nextTransferDate?: string };
    return {
      pendingBani: Math.round((data.balance ?? 0) * 100),
      lastPayoutAt: null,
      nextPayoutAt: data.nextTransferDate ? new Date(data.nextTransferDate) : null,
    };
  } catch (err) {
    log('warn', 'viva.getPayoutStatus failed', { err: String(err) });
    return { pendingBani: 0, lastPayoutAt: null, nextPayoutAt: null };
  }
}

async function vivaOnboardingUrl(ctx: PspContext, tenantId: string): Promise<string | null> {
  // Creates a Viva Marketplace connected account for the restaurant and
  // returns the KYB redirect URL. The restaurant owner completes eKYB on
  // Viva's hosted page; HIR never handles sensitive identity data.
  // Requires VIVA_MARKETPLACE_ENABLED=true (checked in provider-router;
  // this function is only called when marketplace is active).
  const { credentials, log } = ctx;
  if (!credentials.signature || !credentials.apiKey) return null;
  if (credentials.mode !== 'MARKETPLACE') return null;

  const live = credentials.live;
  const base = live ? VIVA_BASE.live : VIVA_BASE.sandbox;

  try {
    const token = await fetchVivaToken(ctx, live);
    const res = await ctx.fetch(`${base}/api/accounts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        countryCode: 'RO',
        requestLang: 'ro-RO',
        reference: tenantId,
      }),
    });
    if (!res.ok) {
      log('warn', 'viva.onboardingUrl account creation failed', { status: res.status });
      return null;
    }
    const data = (await res.json()) as { redirectUrl?: string };
    return data.redirectUrl ?? null;
  } catch (err) {
    log('warn', 'viva.onboardingUrl exception', { err: String(err) });
    return null;
  }
}

export const vivaAdapter: PspAdapter = {
  providerKey: 'viva',
  createIntent: vivaCreateIntent,
  verifyWebhook: vivaVerifyWebhook,
  getPayoutStatus: vivaGetPayoutStatus,
  onboardingUrl: vivaOnboardingUrl,
};

/**
 * Checkout-session helper for the storefront's provider-router.
 * Bridges CheckoutSessionInput → PspIntentInput and delegates to vivaAdapter.createIntent.
 */
export async function createVivaCheckoutSession(
  ctx: PspContext,
  input: CheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  const result = await vivaAdapter.createIntent(ctx, {
    tenantId: input.tenantId ?? '',
    orderId: input.orderId,
    amountBani: input.amountBani,
    currency: input.currency,
    hirFeeBani: HIR_PLATFORM_FEE_BANI,
    customer: input.customer,
    returnUrl: input.successUrl,
    notifyUrl: input.notifyUrl ?? '',
  });

  if (!result.ok) {
    return { ok: false, error: result.error, retry: result.retry };
  }
  return { ok: true, sessionId: result.providerRef, url: result.redirectUrl };
}
