#!/usr/bin/env bash
# RSHIR-53: end-to-end smoke for the integration architecture.
#
# Provisions a Mock provider + scoped API key on tenant2, POSTs an order
# via the public API, polls integration_events until it flips to SENT,
# then tears the test data back down so prod state is unchanged.
#
# Required env:
#   SUPABASE_PAT            Management API token (see supabase_credentials.md)
#   SUPABASE_PROJECT_REF    e.g. qfmeojeipncuxeltnvab
#   RESTAURANT_WEB_BASE     e.g. https://hir-restaurant-web.vercel.app
#
# Optional:
#   TENANT_SLUG             defaults to tenant2
#   POLL_TIMEOUT_S          defaults to 90
#
# Usage:
#   SUPABASE_PAT=sbp_... SUPABASE_PROJECT_REF=qfme... \
#     RESTAURANT_WEB_BASE=https://hir-restaurant-web.vercel.app \
#     bash scripts/smoke-integration.sh

set -euo pipefail

: "${SUPABASE_PAT:?SUPABASE_PAT required}"
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF required}"
: "${RESTAURANT_WEB_BASE:?RESTAURANT_WEB_BASE required}"
TENANT_SLUG="${TENANT_SLUG:-tenant2}"
POLL_TIMEOUT_S="${POLL_TIMEOUT_S:-90}"

SQL_URL="https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query"

sql() {
  # $1 = SQL. Returns the JSON response body.
  python3 -c "import json,sys; print(json.dumps({'query': sys.argv[1]}))" "$1" \
    | curl -s -X POST "$SQL_URL" \
        -H "Authorization: Bearer ${SUPABASE_PAT}" \
        -H "Content-Type: application/json" \
        --data-binary @-
}

cleanup() {
  echo "[smoke] cleanup..."
  sql "delete from public.tenant_api_keys where label='smoke-test';
       delete from public.integration_providers where display_name='Smoke-test Mock';
       update public.tenants set integration_mode='STANDALONE' where slug='${TENANT_SLUG}';" >/dev/null || true
}
trap cleanup EXIT

RAW_KEY="hir_smoke$(openssl rand -hex 16)"
KEY_HASH=$(printf %s "$RAW_KEY" | sha256sum | awk '{print $1}')
KEY_PREFIX="${RAW_KEY:0:12}"
WEBHOOK_SECRET=$(openssl rand -hex 24)

echo "[smoke] provisioning Mock provider + API key on ${TENANT_SLUG}..."
sql "update public.tenants set integration_mode='POS_PUSH' where slug='${TENANT_SLUG}';" >/dev/null
sql "insert into public.integration_providers (tenant_id, provider_key, display_name, config, webhook_secret, is_active)
     select id, 'mock', 'Smoke-test Mock', '{}'::jsonb, '${WEBHOOK_SECRET}', true
       from public.tenants where slug='${TENANT_SLUG}'
     on conflict (tenant_id, provider_key) do update set webhook_secret=excluded.webhook_secret, is_active=true;" >/dev/null
sql "insert into public.tenant_api_keys (tenant_id, key_hash, key_prefix, label, scopes, is_active)
     select id, '${KEY_HASH}', '${KEY_PREFIX}', 'smoke-test', array['orders.write'], true
       from public.tenants where slug='${TENANT_SLUG}';" >/dev/null

echo "[smoke] POST ${RESTAURANT_WEB_BASE}/api/public/v1/orders..."
RES=$(curl -s -w '\n%{http_code}' -X POST "${RESTAURANT_WEB_BASE}/api/public/v1/orders" \
  -H "Authorization: Bearer ${RAW_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"customer":{"firstName":"Smoke","phone":"+40700000099"},
       "items":[{"name":"Pizza Margherita","qty":2,"priceRon":35.0}],
       "totals":{"subtotalRon":70.0,"deliveryFeeRon":10.0,"totalRon":80.0},
       "fulfillment":"DELIVERY",
       "dropoff":{"line1":"Str. Test 1","city":"Brasov"},
       "notes":"smoke test"}')
HTTP_CODE=$(printf %s "$RES" | tail -n1)
BODY=$(printf %s "$RES" | sed '$d')
echo "[smoke] HTTP ${HTTP_CODE}: ${BODY}"
if [ "$HTTP_CODE" != "201" ]; then
  echo "[smoke] FAIL: expected 201, got ${HTTP_CODE}" >&2
  exit 1
fi

ORDER_ID=$(printf %s "$BODY" | python3 -c "import json,sys; print(json.load(sys.stdin)['order_id'])")

echo "[smoke] polling integration_events for order=${ORDER_ID}..."
DEADLINE=$(( $(date +%s) + POLL_TIMEOUT_S ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  ROW=$(sql "select status, attempts, last_error
              from public.integration_events
              where (payload->>'orderId')='${ORDER_ID}'
              order by id desc limit 1;")
  STATUS=$(printf %s "$ROW" | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0]['status'] if r else 'NONE')" 2>/dev/null || echo NONE)
  echo "  status=${STATUS}"
  if [ "$STATUS" = "SENT" ]; then
    echo "[smoke] PASS: dispatcher drained the event."
    exit 0
  fi
  if [ "$STATUS" = "DEAD" ]; then
    echo "[smoke] FAIL: event reached DLQ. Row: ${ROW}" >&2
    exit 2
  fi
  sleep 5
done

echo "[smoke] FAIL: timed out after ${POLL_TIMEOUT_S}s waiting for SENT" >&2
exit 3
