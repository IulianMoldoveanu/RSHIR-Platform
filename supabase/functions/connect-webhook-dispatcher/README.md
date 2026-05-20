# connect-webhook-dispatcher

Outbound webhook delivery for HIR Connect tier. Cron-invoked every 30s by
`connect-webhook-dispatch` pg_cron job.

## Auth

Header `x-hir-notify-secret` must match `HIR_NOTIFY_SECRET` env var
(same secret as `integration-dispatcher`). Returns 401 otherwise.

## What it does

1. Reads up to 100 pending deliveries from `connect_webhook_deliveries`
   where `delivered_at IS NULL AND dead = false AND next_retry_at < now()`.
2. For each: fetches endpoint + signing secret (via
   `connect_get_endpoint_secrets` RPC reading from `vault.decrypted_secrets`).
3. HMAC-SHA256 signs `{delivery_id}.{JSON body}` with the endpoint secret.
4. POSTs to endpoint URL with 15s timeout + these headers:
   - `Content-Type: application/json`
   - `X-HIR-Signature: sha256=<hex>`
   - `X-HIR-Event: <event_type>`
   - `X-HIR-Delivery-Id: <uuid>`
   - `X-HIR-Tenant: <tenant_id>`
5. On 2xx: marks delivered_at + resets endpoint.consecutive_failures.
6. On non-2xx / timeout / network error: schedules next retry per backoff
   schedule below. After 7 total attempts → dead-letters (sets `dead=true`
   and `active=false` on endpoint).

## Backoff schedule

| Attempt # | Delay |
|---|---|
| 1 | immediate (initial enqueue) |
| 2 | +30s |
| 3 | +2m |
| 4 | +10m |
| 5 | +1h |
| 6 | +6h |
| 7 | +24h |
| 8 | dead-letter |

## Signature verification (PHP example)

```php
$expected = 'sha256=' . hash_hmac('sha256', $delivery_id . '.' . $raw_body, $secret);
if (!hash_equals($expected, $_SERVER['HTTP_X_HIR_SIGNATURE'])) {
    http_response_code(401);
    exit('bad signature');
}
```

## Signature verification (JavaScript / Node example)

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyHIRWebhook(rawBody, deliveryId, signatureHeader, secret) {
  const expected = 'sha256=' + createHmac('sha256', secret)
    .update(`${deliveryId}.${rawBody}`)
    .digest('hex');
  return timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader || ''),
  );
}
```

## Payload sample

```json
{
  "event": "order.status_changed",
  "tenant_id": "abe949c6-b4f0-4f08-84e8-4d2caa637bcd",
  "order": {
    "id": "uuid",
    "tenant_id": "uuid",
    "status": "PICKED_UP",
    "subtotal_ron": 75.50,
    "total_ron": 80.50,
    "items": [...],
    "created_at": "2026-05-18T12:34:56Z",
    "updated_at": "2026-05-18T13:01:22Z"
  },
  "previous_status": "READY_FOR_PICKUP",
  "occurred_at": "2026-05-18T13:01:22Z"
}
```

## Idempotency

External integrators MUST treat `X-HIR-Delivery-Id` as the idempotency key.
HIR retries the same delivery_id on transient failures — receivers should
dedupe (e.g. cache delivery_id in a 24h TTL store).

## Volume

Designed for: 500 ord/day × 5 status transitions × 100 tenants = 250k deliveries/day.
Batch size 100, dispatch every 30s → up to 288k deliveries/day per Edge Function instance.

## Deploy

```powershell
$env:SUPABASE_ACCESS_TOKEN = (node -e "console.log(require('C:/Users/Office HIR CEO/.hir/secrets.json').supabase.management_pat)")
npx supabase functions deploy connect-webhook-dispatcher --project-ref qfmeojeipncuxeltnvab --no-verify-jwt
```

After deploy, seed vault secret:
```sql
select vault.create_secret(
  'https://qfmeojeipncuxeltnvab.functions.supabase.co/connect-webhook-dispatcher',
  'connect_webhook_dispatcher_url'
);
```
