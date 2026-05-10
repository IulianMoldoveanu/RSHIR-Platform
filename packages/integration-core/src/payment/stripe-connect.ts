// HIR Restaurant Suite — Stripe Connect PSP adapter (Lane PSP-MULTIGATES-V1).
//
// Iulian directive 2026-05-10: Stripe Connect is fallback/demo only.
// Primary marketplace target remains Netopia/Viva once commercial config
// arrives. Default `psp_credentials.active = false` for new tenants.
//
// Architecture choices:
//   - Direct charges (not destination charges) — funds flow directly to
//     the connected account, HIR collects `application_fee_amount`. No
//     custom payout engine needed; Stripe handles payout schedule per
//     connected-account settings.
//   - Pure HTTP via ctx.fetch (no `stripe` SDK dep in @hir/integration-core
//     — keeps the package zero-dep; matches the Netopia adapter pattern).
//   - Test mode by default. `credentials.live` flips to live keys.
//   - Onboarding URL returns null — defers to the existing
//     `stripe_onboarding_requests` human-approval queue (Iulian's
//     intentional UX). DO NOT bypass.
//
// Webhook verification follows Stripe's documented format:
//   Stripe-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "t.rawBody">
//   Tolerance: 5 minutes (Stripe default).

import type {
  PspAdapter,
  PspContext,
  PspIntentInput,
  PspIntentResult,
  PspPayoutStatus,
  PspWebhookEvent,
} from './contract';

const STRIPE_API = 'https://api.stripe.com/v1';
// Connected-account header for direct charges on behalf of the tenant.
const STRIPE_ACCOUNT_HEADER = 'Stripe-Account';
// Webhook tolerance: 5 minutes, matches Stripe's documented default.
const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

function basicAuth(secretKey: string): string {
  // Stripe accepts `Authorization: Basic base64(secret:)` — empty password.
  // btoa is available in Node ≥18 (Next.js server runtime) and the browser;
  // integration-core stays zero-dep so we use btoa rather than Buffer.
  return `Basic ${btoa(`${secretKey}:`)}`;
}

function formEncode(body: Record<string, string | number | undefined | null>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    out.set(k, String(v));
  }
  return out.toString();
}

/**
 * Verify a Stripe webhook signature.
 *
 * Stripe signs `${timestamp}.${rawBody}` with HMAC-SHA256 using the webhook
 * endpoint secret (whsec_*). Header format:
 *   Stripe-Signature: t=<unix>,v1=<hex>,v1=<hex_alt>...
 * Multiple v1 entries are valid (rotation overlap window). We accept if any
 * matches and the timestamp is within tolerance.
 *
 * Returns true on valid, false otherwise. Never throws on bad input.
 */
async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
  nowMs: number,
): Promise<boolean> {
  if (!signatureHeader || !webhookSecret) return false;

  let timestamp: number | null = null;
  const v1Sigs: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const [k, v] = part.split('=');
    if (!k || !v) continue;
    if (k.trim() === 't') timestamp = Number(v.trim());
    else if (k.trim() === 'v1') v1Sigs.push(v.trim());
  }
  if (timestamp === null || Number.isNaN(timestamp) || v1Sigs.length === 0) {
    return false;
  }

  // Tolerance window — reject replays older than 5 minutes.
  if (Math.abs(nowMs - timestamp * 1000) > WEBHOOK_TOLERANCE_MS) {
    return false;
  }

  const payload = `${timestamp}.${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time compare against any of the offered v1 sigs.
  return v1Sigs.some((cand) => timingSafeEqualHex(expected, cand));
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export const stripeConnectAdapter: PspAdapter = {
  providerKey: 'stripe_connect',

  /**
   * Create a Checkout Session as a direct charge on the connected account.
   * The application fee (`hirFeeBani`) is collected by the platform.
   */
  async createIntent(ctx: PspContext, input: PspIntentInput): Promise<PspIntentResult> {
    const { credentials, fetch: f, log } = ctx;

    if (!credentials.apiKey) {
      return { ok: false, error: 'stripe_credentials_missing', retry: false };
    }
    if (credentials.mode === 'MARKETPLACE' && !credentials.subMerchantId) {
      // For Stripe Connect, sub_merchant_id is the connected account id (acct_*).
      return { ok: false, error: 'connected_account_id_required', retry: false };
    }

    const params: Record<string, string | number | undefined> = {
      mode: 'payment',
      'payment_method_types[0]': 'card',
      success_url: input.returnUrl,
      cancel_url: input.returnUrl,
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][currency]': input.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': input.amountBani,
      'line_items[0][price_data][product_data][name]': `Comandă ${input.orderId}`,
      customer_email: input.customer.email,
      'metadata[order_id]': input.orderId,
      'metadata[tenant_id]': input.tenantId,
    };

    // Direct charge: application_fee_amount on the PaymentIntent. The
    // `Stripe-Account` header routes the call to the connected account.
    if (credentials.mode === 'MARKETPLACE' && input.hirFeeBani && input.hirFeeBani > 0) {
      params['payment_intent_data[application_fee_amount]'] = input.hirFeeBani;
    }

    const headers: Record<string, string> = {
      Authorization: basicAuth(credentials.apiKey),
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (credentials.mode === 'MARKETPLACE' && credentials.subMerchantId) {
      headers[STRIPE_ACCOUNT_HEADER] = credentials.subMerchantId;
    }

    log('info', 'stripe_connect.createIntent dispatching', {
      mode: credentials.mode,
      orderId: input.orderId,
      amountBani: input.amountBani,
      live: credentials.live,
    });

    let res: Response;
    try {
      res = await f(`${STRIPE_API}/checkout/sessions`, {
        method: 'POST',
        headers,
        body: formEncode(params),
      });
    } catch (err) {
      log('error', 'stripe_connect.createIntent fetch failed', {
        message: (err as Error).message,
      });
      return { ok: false, error: 'stripe_network_error', retry: true };
    }

    const json = (await res.json().catch(() => null)) as
      | { id?: string; url?: string; error?: { message?: string; type?: string } }
      | null;

    if (!res.ok || !json || !json.id || !json.url) {
      log('warn', 'stripe_connect.createIntent rejected', {
        status: res.status,
        error: json?.error?.type ?? null,
      });
      return {
        ok: false,
        error: json?.error?.type ?? 'stripe_rejected',
        // 5xx is retryable, 4xx is not.
        retry: res.status >= 500,
      };
    }

    return {
      ok: true,
      providerRef: json.id,
      redirectUrl: json.url,
      raw: json,
    };
  },

  /**
   * Verify a Stripe webhook envelope and map to the canonical PspWebhookEvent.
   *
   * The webhook secret is passed via `credentials.apiKey` here — the route
   * layer is expected to swap apiKey for the webhook secret when calling
   * verifyWebhook (mirrors Netopia's pattern; the field is overloaded
   * deliberately to avoid widening the contract).
   */
  async verifyWebhook(
    ctx: PspContext,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<PspWebhookEvent> {
    const { credentials, log } = ctx;
    const sigHeader =
      headers['stripe-signature'] ?? headers['Stripe-Signature'] ?? '';

    const ok = await verifyStripeSignature(
      rawBody,
      sigHeader,
      credentials.apiKey,
      Date.now(),
    );
    if (!ok) {
      log('warn', 'stripe_connect.verifyWebhook signature invalid', {
        bodyLen: rawBody.length,
      });
      return null;
    }

    let parsed: {
      id?: string;
      type?: string;
      data?: { object?: { id?: string; amount?: number; amount_refunded?: number; failure_message?: string } };
    } | null = null;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!parsed || !parsed.id || !parsed.type || !parsed.data?.object?.id) {
      return null;
    }

    const obj = parsed.data.object;
    const eventId: string = parsed.id;
    const providerRef: string = obj.id as string;

    switch (parsed.type) {
      case 'payment_intent.succeeded':
      case 'checkout.session.completed':
        return {
          kind: 'payment.captured',
          providerRef,
          amountBani: typeof obj.amount === 'number' ? obj.amount : 0,
          eventId,
        };
      case 'payment_intent.payment_failed':
        return {
          kind: 'payment.failed',
          providerRef,
          reason: obj.failure_message ?? 'unknown',
          eventId,
        };
      case 'charge.refunded':
        return {
          kind: 'payment.refunded',
          providerRef,
          amountBani: typeof obj.amount_refunded === 'number' ? obj.amount_refunded : 0,
          eventId,
        };
      default:
        return null;
    }
  },

  /**
   * Read pending balance for the connected account. Direct charges leave
   * funds on the connected account; we query the connected account's
   * /v1/balance and return the `pending` slice.
   */
  async getPayoutStatus(ctx: PspContext, _tenantId: string): Promise<PspPayoutStatus> {
    const { credentials, fetch: f, log } = ctx;
    if (!credentials.apiKey || !credentials.subMerchantId) {
      return { pendingBani: 0, lastPayoutAt: null, nextPayoutAt: null };
    }

    try {
      const res = await f(`${STRIPE_API}/balance`, {
        method: 'GET',
        headers: {
          Authorization: basicAuth(credentials.apiKey),
          [STRIPE_ACCOUNT_HEADER]: credentials.subMerchantId,
        },
      });
      if (!res.ok) {
        return { pendingBani: 0, lastPayoutAt: null, nextPayoutAt: null };
      }
      const body = (await res.json()) as {
        pending?: Array<{ amount: number; currency: string }>;
      };
      const pendingRon =
        body.pending?.find((p) => p.currency === 'ron')?.amount ?? 0;
      // lastPayoutAt / nextPayoutAt require /v1/payouts list — V2 work,
      // not blocking for the admin status surface.
      return { pendingBani: pendingRon, lastPayoutAt: null, nextPayoutAt: null };
    } catch (err) {
      log('warn', 'stripe_connect.getPayoutStatus failed', {
        message: (err as Error).message,
      });
      return { pendingBani: 0, lastPayoutAt: null, nextPayoutAt: null };
    }
  },

  /**
   * Stripe Connect onboarding is intentionally request-queue-gated via the
   * existing `stripe_onboarding_requests` table. Returning null forces the
   * admin UI to surface the existing OWNER-submits / platform-admin-approves
   * UX (per Iulian, 2026-05-05). DO NOT replace with /v1/account_links.
   */
  async onboardingUrl(_ctx: PspContext, _tenantId: string): Promise<string | null> {
    return null;
  },
};

// Test-only export — kept on the adapter module so a future smoke or unit
// test (when integration-core gets a runner) can exercise signature
// verification directly. Not part of the public adapter surface.
export const __test = { verifyStripeSignature };
