import { createHmac } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { createAdminClient } from './supabase/admin';
import { isPrivateIpv4, isPrivateIpv6, validateWebhookUrl } from './url-safety';

export type WebhookPayload = {
  event: 'order.status_changed' | 'order.cancelled';
  orderId: string;
  externalOrderId: string | null;
  status: string;
  occurredAt: string;
};

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

  // SSRF guard #1: scheme + hostname shape. An older order row could carry a
  // URL stored before the create-time guard shipped, so we re-validate every
  // dispatch. Failed URLs are logged + skipped; we do NOT bump the failure
  // counter (it's a misconfiguration, not a transport failure).
  const urlCheck = validateWebhookUrl(order.webhook_callback_url);
  if (!urlCheck.ok) {
    console.warn('[courier-webhook] blocked unsafe url', orderId, urlCheck.error);
    return;
  }

  // SSRF guard #2: DNS rebinding. The host might be a public name that
  // resolves to a private/loopback/metadata IP. Resolve once and abort if
  // the result is internal. We cannot pin the resolved IP for fetch() in
  // pure Node fetch, so this is best-effort — a TOCTOU window remains
  // (host could re-resolve between our check and fetch's resolution).
  // To close it fully we'd need a custom Agent that resolves once and
  // pins the IP; out of scope for this surgical fix.
  try {
    const resolved = await dnsLookup(urlCheck.url.hostname, { all: true });
    for (const r of resolved) {
      if (r.family === 4 && isPrivateIpv4(r.address)) {
        console.warn('[courier-webhook] blocked private-ip resolution', orderId, r.address);
        return;
      }
      if (r.family === 6 && isPrivateIpv6(r.address)) {
        console.warn('[courier-webhook] blocked private-ip resolution', orderId, r.address);
        return;
      }
    }
  } catch (e) {
    console.warn('[courier-webhook] dns lookup failed', orderId, (e as Error).message);
    return;
  }

  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', order.webhook_secret).update(body).digest('hex');

  let success = false;
  try {
    const res = await fetch(urlCheck.url.toString(), {
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
