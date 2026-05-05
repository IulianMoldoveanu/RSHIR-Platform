// External Fleet Manager dispatch hook (multi-tenant Option A).
//
// When a tenant has `external_dispatch_enabled=true` and the order
// transitions to DISPATCHED, we POST a signed payload to the configured
// webhook URL. The Fleet Manager's own dispatch app then assigns one of
// his riders. The HIR courier app does NOT pick up these orders (in
// the current schema, nothing auto-inserts into courier_orders for
// restaurant orders, so the "skip" is implicit).
//
// Failure handling: 3 retries with exponential backoff (250ms / 750ms /
// 2250ms). On final failure, the attempt is logged to
// external_dispatch_attempts and the order remains in DISPATCHED state.
// The platform-admin UI (PR 2) can surface the failure rate from this
// table; for now the manual recovery path is "operator notices and
// dispatches via HIR courier app instead". `fallback_to_hir` is reserved
// for a future flag that auto-creates a courier_orders row on failure;
// today there is no auto-create path so the flag is informational only.
//
// Internal naming throughout — never exposed to merchants.

import { createHmac, createHash } from 'node:crypto';
import { createAdminClient } from './supabase/admin';

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [250, 750, 2250];

export type ExternalDispatchPayload = {
  order_id: string;
  tenant_id: string;
  dispatched_at: string; // ISO 8601 UTC
  total_ron: number;
  customer: {
    first_name: string;
    last_name: string | null;
    phone: string;
  };
  delivery_address: {
    line1: string;
    line2: string | null;
    city: string | null;
    notes: string | null;
  };
  items: Array<{
    name: string;
    quantity: number;
    unit_price_ron: number;
  }>;
};

export type ExternalDispatchResult =
  | { kind: 'no_config' } // tenant has no external dispatch -> caller should do nothing special
  | { kind: 'disabled' } // tenant configured but flag off -> same as no_config
  | { kind: 'success'; durationMs: number }
  | { kind: 'failed'; error: string; attempts: number; fallbackToHir: boolean };

type TenantDispatchConfig = {
  webhook_url: string;
  secret: string;
  enabled: boolean;
};

async function loadTenantConfig(tenantId: string): Promise<TenantDispatchConfig | null> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data, error } = await sb
    .from('tenants')
    .select(
      'external_dispatch_webhook_url, external_dispatch_secret, external_dispatch_enabled',
    )
    .eq('id', tenantId)
    .maybeSingle();
  if (error) {
    // If the columns don't exist yet (migration not applied), treat
    // as no-config and let the order proceed normally. PostgREST
    // returns "column ... does not exist" in this case.
    if (/external_dispatch/.test(error.message ?? '')) return null;
    console.error('[external-dispatch] tenant config read failed', error.message);
    return null;
  }
  if (!data) return null;
  const row = data as {
    external_dispatch_webhook_url: string | null;
    external_dispatch_secret: string | null;
    external_dispatch_enabled: boolean;
  };
  if (!row.external_dispatch_webhook_url || !row.external_dispatch_secret) {
    return null;
  }
  return {
    webhook_url: row.external_dispatch_webhook_url,
    secret: row.external_dispatch_secret,
    enabled: row.external_dispatch_enabled,
  };
}

// Exported for unit testing the HMAC contract. Receivers will verify
// using the same `sha256=<hex>` envelope on the X-HIR-Signature header.
export function signBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

export function sha256Hex(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

async function postOnce(
  url: string,
  body: string,
  signature: string,
  timestamp: string,
  tenantId: string,
): Promise<{ status: number; body: string } | { error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-HIR-Signature': `sha256=${signature}`,
        'X-HIR-Timestamp': timestamp,
        'X-HIR-Tenant': tenantId,
      },
      body,
    });
    const text = await res.text().catch(() => '');
    return { status: res.status, body: text.slice(0, 500) };
  } catch (e) {
    return { error: (e as Error).message ?? 'fetch_failed' };
  } finally {
    clearTimeout(timer);
  }
}

async function logAttempt(args: {
  tenantId: string;
  orderId: string;
  attemptNumber: number;
  url: string;
  bodyHash: string;
  status: number | null;
  responseExcerpt: string | null;
  errorMessage: string | null;
  succeeded: boolean;
  durationMs: number;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = admin as any;
    await sb.from('external_dispatch_attempts').insert({
      tenant_id: args.tenantId,
      order_id: args.orderId,
      attempt_number: args.attemptNumber,
      request_url: args.url,
      request_body_sha256: args.bodyHash,
      response_status: args.status,
      response_body_excerpt: args.responseExcerpt,
      error_message: args.errorMessage,
      succeeded: args.succeeded,
      duration_ms: args.durationMs,
    });
  } catch (e) {
    // Best-effort. Never block the order flow on audit failure.
    console.error('[external-dispatch] attempt log failed', (e as Error).message);
  }
}

/**
 * Forward an order to the tenant's external Fleet Manager dispatch
 * endpoint, if configured. No-op when the tenant doesn't have the
 * feature enabled.
 *
 * Caller MUST be a server-side execution context (server action, route
 * handler, or edge function). Uses the service-role admin client.
 */
export async function dispatchToExternalFleet(
  payload: ExternalDispatchPayload,
): Promise<ExternalDispatchResult> {
  const config = await loadTenantConfig(payload.tenant_id);
  if (!config) return { kind: 'no_config' };
  if (!config.enabled) return { kind: 'disabled' };

  const body = JSON.stringify(payload);
  const bodyHash = sha256Hex(body);
  const signature = signBody(body, config.secret);
  const timestamp = new Date().toISOString();

  let lastError = 'unknown';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const start = Date.now();
    const result = await postOnce(
      config.webhook_url,
      body,
      signature,
      timestamp,
      payload.tenant_id,
    );
    const durationMs = Date.now() - start;

    if ('error' in result) {
      lastError = result.error;
      await logAttempt({
        tenantId: payload.tenant_id,
        orderId: payload.order_id,
        attemptNumber: attempt,
        url: config.webhook_url,
        bodyHash,
        status: null,
        responseExcerpt: null,
        errorMessage: result.error,
        succeeded: false,
        durationMs,
      });
    } else {
      const ok = result.status >= 200 && result.status < 300;
      await logAttempt({
        tenantId: payload.tenant_id,
        orderId: payload.order_id,
        attemptNumber: attempt,
        url: config.webhook_url,
        bodyHash,
        status: result.status,
        responseExcerpt: result.body || null,
        errorMessage: ok ? null : `http_${result.status}`,
        succeeded: ok,
        durationMs,
      });
      if (ok) return { kind: 'success', durationMs };
      lastError = `http_${result.status}`;
      // 4xx: do not retry — payload is rejected, retrying won't help.
      if (result.status >= 400 && result.status < 500) {
        return {
          kind: 'failed',
          error: lastError,
          attempts: attempt,
          fallbackToHir: true,
        };
      }
    }
    // Wait before next attempt (skip wait after the final attempt).
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1] ?? 1000));
    }
  }

  return {
    kind: 'failed',
    error: lastError,
    attempts: MAX_ATTEMPTS,
    fallbackToHir: true,
  };
}
