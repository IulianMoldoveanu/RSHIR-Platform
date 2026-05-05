#!/usr/bin/env bash
# Lane F smoke — inbound courier-mirror-pharma with the 4 new optional fields.
#
# Posts a synthetic `order.created` payload (HMAC-signed) carrying
# payment_method, cod_amount_ron, pharma_callback_url, pharma_callback_secret
# and asserts:
#   1. Edge function returns 200 with the expected echo fields
#   2. The courier_orders row was inserted with all 4 fields persisted
#
# Then tears down the synthetic row so prod state is unchanged.
#
# Required env:
#   SUPABASE_PAT            Management API token
#   SUPABASE_PROJECT_REF    e.g. qfmeojeipncuxeltnvab
#   PHARMA_HMAC_SECRET      The 'primary' secret from pharma_webhook_secrets
#   FUNCTION_URL            e.g. https://<ref>.supabase.co/functions/v1/courier-mirror-pharma
#
# Usage:
#   SUPABASE_PAT=sbp_... SUPABASE_PROJECT_REF=qfme... \
#     PHARMA_HMAC_SECRET=... \
#     FUNCTION_URL=https://qfme....supabase.co/functions/v1/courier-mirror-pharma \
#     bash scripts/smoke-pharma-callback.sh

set -euo pipefail

: "${SUPABASE_PAT:?SUPABASE_PAT required}"
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF required}"
: "${PHARMA_HMAC_SECRET:?PHARMA_HMAC_SECRET required}"
: "${FUNCTION_URL:?FUNCTION_URL required}"

SQL_URL="https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query"

sql() {
  python3 -c "import json,sys; print(json.dumps({'query': sys.argv[1]}))" "$1" \
    | curl -s -X POST "$SQL_URL" \
        -H "Authorization: Bearer ${SUPABASE_PAT}" \
        -H "Content-Type: application/json" \
        --data-binary @-
}

# Synthetic pharma_order_id; tear-down at the end matches on this.
PHARMA_ORDER_ID="lane-f-smoke-$(date +%s)"
PAYLOAD=$(python3 - <<EOF
import json
print(json.dumps({
  "event": "order.created",
  "at": "2026-05-04T12:00:00Z",
  "order": {
    "pharma_order_id": "${PHARMA_ORDER_ID}",
    "status": "READY_FOR_PICKUP",
    "pickup": {"lat": 45.6580, "lng": 25.6010, "address": "Farmacia Test, Brașov",
               "contact_name": "Test", "contact_phone": "+40700000000"},
    "dropoff": {"lat": 45.6480, "lng": 25.5910, "address": "Str. Test 1, Brașov",
                "customer_name": "Smoke", "customer_phone": "+40700000001"},
    "items_summary": "1× Paracetamol",
    "requires_id_verification": False,
    "requires_prescription": True,
    "total_value_ron": 47.50,
    "payment_method": "COD",
    "cod_amount_ron": 47.50,
    "pharma_callback_url": "https://example.invalid/pharma/callback",
    "pharma_callback_secret": "smoke-callback-secret-v1"
  },
  "fleet_slug": "hir-default"
}))
EOF
)

# HMAC-SHA256 sign with the primary pharma_webhook_secrets row.
SIG=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$PHARMA_HMAC_SECRET" -hex \
  | awk '{print $2}')

echo "→ POST $FUNCTION_URL (pharma_order_id=$PHARMA_ORDER_ID)"
RESP=$(curl -sS -X POST "$FUNCTION_URL" \
  -H "content-type: application/json" \
  -H "x-hir-signature: sha256=${SIG}" \
  --data-binary "$PAYLOAD")
echo "  response: $RESP"

# Assert ok=true and at least one of the new fields echoed back.
echo "$RESP" | python3 -c '
import json, sys
r = json.loads(sys.stdin.read())
assert r.get("ok") is True, f"function did not return ok: {r}"
assert r.get("payment_method") == "COD", f"payment_method not echoed: {r}"
assert r.get("cod_amount_ron") in (47.5, 47.50), f"cod_amount_ron not echoed: {r}"
assert r.get("pharma_callback_url") == "https://example.invalid/pharma/callback", \
    f"pharma_callback_url not echoed: {r}"
print("  ✓ response echo OK")
'

echo "→ verifying courier_orders row..."
ROW=$(sql "select payment_method, cod_amount_ron, pharma_callback_url \
           from public.courier_orders \
           where vertical='pharma' and external_ref='${PHARMA_ORDER_ID}'")
echo "  db row: $ROW"
echo "$ROW" | python3 -c '
import json, sys
rows = json.loads(sys.stdin.read())
assert isinstance(rows, list) and len(rows) == 1, f"expected 1 row, got: {rows}"
r = rows[0]
assert r["payment_method"] == "COD"
assert float(r["cod_amount_ron"]) == 47.50
assert r["pharma_callback_url"] == "https://example.invalid/pharma/callback"
print("  ✓ courier_orders fields persisted")
'

echo "→ verifying courier_order_secrets sibling row..."
# Migration 20260605_004 moved pharma_callback_secret to a sibling RLS-locked
# table. service_role (the SUPABASE_PAT path used by sql()) can SELECT it.
SECRET_ROW=$(sql "select s.pharma_callback_secret \
                  from public.courier_order_secrets s \
                  join public.courier_orders o on o.id = s.courier_order_id \
                  where o.vertical='pharma' and o.external_ref='${PHARMA_ORDER_ID}'")
echo "  secret row: $SECRET_ROW"
echo "$SECRET_ROW" | python3 -c '
import json, sys
rows = json.loads(sys.stdin.read())
assert isinstance(rows, list) and len(rows) == 1, f"expected 1 secret row, got: {rows}"
r = rows[0]
assert r["pharma_callback_secret"] == "smoke-callback-secret-v1"
print("  ✓ pharma_callback_secret persisted in sibling table")
'

echo "→ tearing down synthetic row..."
# courier_order_secrets cascades on courier_orders.id delete.
sql "delete from public.courier_orders \
     where vertical='pharma' and external_ref='${PHARMA_ORDER_ID}'" > /dev/null
echo "  ✓ teardown complete"

echo
echo "Lane F inbound smoke: PASS"
