import { createHmac } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { createAdminClient } from './supabase/admin';
import { logAudit } from './audit';
import { isPrivateIpv4, isPrivateIpv6, validateWebhookUrl } from './url-safety';

export type WebhookPayload = {
  event: 'order.status_changed' | 'order.cancelled';
  orderId: string;
  externalOrderId: string | null;
  status: string;
  occurredAt: string;
};

/**
 * Shared SSRF + DNS-rebinding guard. Returns the resolved-safe URL on
 * success, or null on any failure (with a console.warn already logged).
 * Pulled out of `sendWebhook` so the pharma callback path can reuse the
 * exact same guarantees without duplicating the validation logic.
 */
async function assertSafeOutboundUrl(rawUrl: string, tag: string): Promise<URL | null> {
  const urlCheck = validateWebhookUrl(rawUrl);
  if (!urlCheck.ok) {
    console.warn(`[${tag}] blocked unsafe url`, urlCheck.error);
    return null;
  }
  try {
    const resolved = await dnsLookup(urlCheck.url.hostname, { all: true });
    for (const r of resolved) {
      if (r.family === 4 && isPrivateIpv4(r.address)) {
        console.warn(`[${tag}] blocked private-ip resolution`, r.address);
        return null;
      }
      if (r.family === 6 && isPrivateIpv6(r.address)) {
        console.warn(`[${tag}] blocked private-ip resolution`, r.address);
        return null;
      }
    }
  } catch (e) {
    console.warn(`[${tag}] dns lookup failed`, (e as Error).message);
    return null;
  }
  return urlCheck.url;
}

/**
 * POST a signed status-change event to the third-party callback URL stored
 * on the order, then update the order's webhook bookkeeping fields.
 *
 * Signature header: `X-HIR-Webhook-Signature: sha256=<hex>`. The signed
 * payload is the raw JSON body. Receiver re-computes HMAC with the secret
 * they shared at order creation and compares.
 *
 * Best-effort: a failed POST is logged and the failure_count is bumped,
 * but it never throws back to the caller. A future Edge Function will
 * sweep `idx_courier_orders_pending_webhook` for retries.
 */
export async function sendWebhook(orderId: string, payload: WebhookPayload): Promise<void> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from('courier_orders')
    .select('webhook_callback_url, webhook_secret')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || !order.webhook_callback_url || !order.webhook_secret) {
    return; // no subscriber, nothing to do
  }

  const safeUrl = await assertSafeOutboundUrl(order.webhook_callback_url, `courier-webhook ${orderId}`);
  if (!safeUrl) return;

  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', order.webhook_secret).update(body).digest('hex');

  let success = false;
  try {
    const res = await fetch(safeUrl.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hir-webhook-signature': `sha256=${signature}`,
        'user-agent': 'hir-courier-webhook/1',
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    success = res.ok;
    if (!res.ok) {
      console.warn(
        '[courier-webhook] non-2xx from subscriber',
        orderId,
        res.status,
        (await res.text().catch(() => '')).slice(0, 200),
      );
    }
  } catch (e) {
    console.warn('[courier-webhook] send failed', orderId, (e as Error).message);
  }

  await admin
    .from('courier_orders')
    .update({
      last_webhook_status: success ? payload.status : null,
      last_webhook_attempt_at: new Date().toISOString(),
      webhook_failure_count: success ? 0 : undefined,
    })
    .eq('id', orderId);

  if (!success) {
    // Bump failure count via re-read + increment. A future Edge Function
    // sweep on idx_courier_orders_pending_webhook will retry these.
    const { data: row } = await admin
      .from('courier_orders')
      .select('webhook_failure_count')
      .eq('id', orderId)
      .maybeSingle();
    const next = ((row?.webhook_failure_count as number | undefined) ?? 0) + 1;
    await admin.from('courier_orders').update({ webhook_failure_count: next }).eq('id', orderId);
  }
}

// ---------------------------------------------------------------------------
// Pharma outbound callback (Lane F).
//
// When a pharma-vertical order changes status inside the courier app, we
// notify the pharma backend via the per-order callback URL + secret it
// supplied at order.created time. Mirror image of the inbound
// courier-mirror-pharma webhook: same HMAC scheme, opposite direction.
//
// Idempotency contract: pharma side dedupes by (courier_order_id, status).
// A duplicate POST is a no-op for them, so failed sends can be retried
// safely. We do NOT bump webhook_failure_count here — pharma orders use
// a separate column-less audit trail (`pharma.callback_sent` audit rows)
// since they don't share the restaurant retry sweep.
//
// Best-effort: a failed POST never blocks the courier UX. The audit trail
// captures the attempt so a future sweep can retry from the failure record.
// ---------------------------------------------------------------------------
export type PharmaCallbackPayload = {
  event: 'order.status_changed';
  courier_order_id: string;
  vertical: 'pharma';
  status: string;
  at: string;
};

export async function notifyPharmaCallback(
  orderId: string,
  status: string,
  actorUserId?: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from('courier_orders')
    .select('vertical, pharma_callback_url, pharma_callback_secret')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) return;
  const row = order as {
    vertical: 'restaurant' | 'pharma' | null;
    pharma_callback_url: string | null;
    pharma_callback_secret: string | null;
  };

  // Restaurant orders never trigger pharma callbacks. Hard guard so a
  // future caller that forgets to check `vertical` can't accidentally
  // POST restaurant-order events to a pharma subscriber.
  if (row.vertical !== 'pharma') return;
  if (!row.pharma_callback_url || !row.pharma_callback_secret) return;

  const safeUrl = await assertSafeOutboundUrl(
    row.pharma_callback_url,
    `pharma-callback ${orderId}`,
  );
  if (!safeUrl) return;

  const payload: PharmaCallbackPayload = {
    event: 'order.status_changed',
    courier_order_id: orderId,
    vertical: 'pharma',
    status,
    at: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', row.pharma_callback_secret).update(body).digest('hex');

  let success = false;
  let httpStatus: number | null = null;
  let attempt = 1;

  // Single retry on 5xx (and only on 5xx). 4xx is a contract bug pharma
  // owns; retrying won't help. Network errors get one retry too.
  for (attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(safeUrl.toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hir-signature': `sha256=${signature}`,
          'user-agent': 'hir-pharma-callback/1',
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      httpStatus = res.status;
      success = res.ok;
      if (success) break;
      if (res.status < 500) break; // 4xx — don't retry
      // 5xx falls through to the retry iteration
    } catch (e) {
      console.warn('[pharma-callback] send failed', orderId, attempt, (e as Error).message);
      // Network error — retry once, then give up
    }
  }

  if (actorUserId) {
    // Audit trail uses sig prefix only (first 8 hex chars) so the secret
    // never leaks into audit_log even partially.
    await logAudit({
      actorUserId,
      action: 'pharma.callback_sent',
      entityType: 'courier_order',
      entityId: orderId,
      metadata: {
        status,
        url_host: safeUrl.host,
        http_status: httpStatus,
        success,
        attempts: attempt,
        sig_prefix: signature.slice(0, 8),
      },
    });
  }
}
