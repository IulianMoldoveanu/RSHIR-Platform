# integration-dispatcher

Async drainer for `public.integration_events`. Triggered every 30s by the
`integration-dispatcher-tick` pg_cron job. Mock-only for MVP — real
vendor adapters land later.

## Local invoke

```bash
supabase functions serve integration-dispatcher --no-verify-jwt
curl -X POST http://localhost:54321/functions/v1/integration-dispatcher \
  -H "x-hir-notify-secret: $HIR_NOTIFY_SECRET" \
  -H "Content-Type: application/json" -d '{}'
```

## Deploy

```bash
supabase functions deploy integration-dispatcher \
  --project-ref qfmeojeipncuxeltnvab
```

Set the vault entry once (Management API SQL):

```sql
select vault.create_secret(
  'https://qfmeojeipncuxeltnvab.functions.supabase.co/integration-dispatcher',
  'integration_dispatcher_url', 'dispatcher fn URL');
```

## Smoke: Webhook IN endpoint (Mock)

```bash
TENANT=<tenant-uuid>; SECRET=<provider.webhook_secret>
BODY='{"kind":"order.status_changed","orderId":"<order-uuid>","status":"DELIVERED"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
curl -X POST "https://<web-host>/api/integrations/webhooks/mock/$TENANT" \
  -H "Content-Type: application/json" \
  -H "x-hir-mock-signature: $SIG" -d "$BODY"
```
