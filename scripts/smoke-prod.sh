#!/usr/bin/env bash
# RSHIR-25 — Production smoke test for HIR Restaurant Suite.
#
# Probes the live storefront + admin surface enough to prove a pilot tenant
# is reachable, multi-tenant routing works, the checkout API is alive, and
# the admin signup gate works. Read-only and idempotent.
#
# Usage:
#   bash scripts/smoke-prod.sh                                 # localhost dev
#   RESTAURANT_WEB_BASE=https://tenant1.hir.ro \
#     ADMIN_BASE=https://admin.hir.ro \
#     bash scripts/smoke-prod.sh                               # production
#   bash scripts/smoke-prod.sh https://tenant1.hir.ro https://admin.hir.ro
#
# Tenant slug defaults to "tenant1"; override with TENANT_SLUG=...
# When RESTAURANT_WEB_BASE is on lvh.me / localhost the script forces the
# Host header to ${TENANT_SLUG}.lvh.me so multi-tenant routing resolves.
#
# Exit code: 0 if every step passes, 1 otherwise.
# Dependencies: bash, curl, jq.

set -u
set -o pipefail

# ---- args / env -------------------------------------------------------------
RESTAURANT_WEB_BASE="${1:-${RESTAURANT_WEB_BASE:-http://localhost:3000}}"
ADMIN_BASE="${2:-${ADMIN_BASE:-http://localhost:3001}}"
TENANT_SLUG="${TENANT_SLUG:-tenant1}"

RESTAURANT_WEB_BASE="${RESTAURANT_WEB_BASE%/}"
ADMIN_BASE="${ADMIN_BASE%/}"

# ---- preflight --------------------------------------------------------------
for bin in curl jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "ERROR: required dependency '$bin' not found in PATH" >&2
    exit 1
  fi
done

# ---- color helpers ----------------------------------------------------------
if [ -t 1 ]; then
  C_RED=$'\033[0;31m'; C_GRN=$'\033[0;32m'; C_YLW=$'\033[0;33m'
  C_DIM=$'\033[2m';    C_RST=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YLW=""; C_DIM=""; C_RST=""
fi

PASS_COUNT=0
FAIL_COUNT=0
FAILED_STEPS=()

step() { printf "%s==>%s %s\n" "$C_DIM" "$C_RST" "$1"; }
ok()   { printf "    %sOK%s   %s\n" "$C_GRN" "$C_RST" "$1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { printf "    %sFAIL%s %s\n" "$C_RED" "$C_RST" "$1"; FAIL_COUNT=$((FAIL_COUNT + 1)); FAILED_STEPS+=("$1"); }
note() { printf "    %s%s%s\n" "$C_YLW" "$1" "$C_RST"; }

# Decide whether to inject Host header (only for non-routable hostnames).
host_header_args=()
case "$RESTAURANT_WEB_BASE" in
  *localhost*|*127.0.0.1*|*lvh.me*)
    host_header_args=(-H "Host: ${TENANT_SLUG}.lvh.me")
    ;;
esac

CURL_BASE=(curl --silent --show-error --max-time 15)

echo
echo "RSHIR-25 production smoke"
echo "  storefront base : $RESTAURANT_WEB_BASE"
echo "  admin base      : $ADMIN_BASE"
echo "  tenant slug     : $TENANT_SLUG"
[ ${#host_header_args[@]} -gt 0 ] && echo "  using Host hdr  : ${TENANT_SLUG}.lvh.me"
echo

# ---- 1. Storefront index ----------------------------------------------------
step "1. GET ${RESTAURANT_WEB_BASE}/  (tenant=${TENANT_SLUG})"
tmp_body=$(mktemp); tmp_code=$(mktemp)
"${CURL_BASE[@]}" "${host_header_args[@]}" -o "$tmp_body" -w "%{http_code}" \
  "${RESTAURANT_WEB_BASE}/" > "$tmp_code" || true
http_code=$(cat "$tmp_code")
if [ "$http_code" = "200" ]; then
  ok "/  -> 200"
  if grep -qiE "(Pizzeria|Bistro|${TENANT_SLUG})" "$tmp_body"; then
    ok "tenant content present in body"
  else
    fail "no tenant name found in storefront body (looked for Pizzeria/Bistro/${TENANT_SLUG})"
  fi
else
  fail "/  -> ${http_code} (expected 200)"
fi
rm -f "$tmp_body" "$tmp_code"

# ---- 2. /bio page -----------------------------------------------------------
step "2. GET ${RESTAURANT_WEB_BASE}/bio"
http_code=$("${CURL_BASE[@]}" "${host_header_args[@]}" -o /dev/null -w "%{http_code}" \
  "${RESTAURANT_WEB_BASE}/bio" || echo "000")
if [ "$http_code" = "200" ]; then
  ok "/bio -> 200"
else
  fail "/bio -> ${http_code} (expected 200)"
fi

# ---- 3. /m/<slug> with og:title --------------------------------------------
step "3. GET first /m/<slug> link from storefront, verify og:title"
tmp_index=$(mktemp)
"${CURL_BASE[@]}" "${host_header_args[@]}" -o "$tmp_index" \
  "${RESTAURANT_WEB_BASE}/" || true
# Storefront markup uses href="/m/<slug>" links per buildItemSlug().
sample_slug=$(grep -oE '/m/[a-z0-9][a-z0-9-]*' "$tmp_index" | head -n1 | sed 's|^/m/||')
rm -f "$tmp_index"

if [ -z "$sample_slug" ]; then
  note "no /m/<slug> link discovered on storefront — skipping og:title check"
  fail "could not discover sample item slug (storefront may have no items seeded)"
else
  echo "    sample slug: $sample_slug"
  tmp_item=$(mktemp); tmp_code=$(mktemp)
  "${CURL_BASE[@]}" "${host_header_args[@]}" -o "$tmp_item" -w "%{http_code}" \
    "${RESTAURANT_WEB_BASE}/m/${sample_slug}" > "$tmp_code" || true
  http_code=$(cat "$tmp_code")
  if [ "$http_code" = "200" ]; then
    ok "/m/${sample_slug} -> 200"
    if grep -qiE 'property="og:title"|name="og:title"' "$tmp_item"; then
      ok "og:title meta tag present"
    else
      fail "og:title meta tag missing on /m/${sample_slug}"
    fi
  else
    fail "/m/${sample_slug} -> ${http_code} (expected 200)"
  fi
  rm -f "$tmp_item" "$tmp_code"
fi

# ---- 4. POST /api/checkout/quote -------------------------------------------
# We can't hardcode item UUIDs (they're seeded fresh per environment), so we
# probe the route with a syntactically valid request that will fail at the
# pricing layer. A 200 + quote.totalRon proves a real cart was supplied via
# SAMPLE_ITEM_ID + SAMPLE_QTY env. Otherwise we accept 422 quote_failed as
# proof the route + tenant resolution + schema validation are alive.
step "4. POST ${RESTAURANT_WEB_BASE}/api/checkout/quote"
quote_payload=$(jq -nc --arg id "${SAMPLE_ITEM_ID:-00000000-0000-0000-0000-000000000000}" \
  --argjson qty "${SAMPLE_QTY:-1}" \
  '{ items: [ { itemId: $id, quantity: $qty } ],
     address: { line1: "Strada Republicii 1", city: "Brasov",
                lat: 45.6427, lng: 25.5887 } }')
tmp_resp=$(mktemp); tmp_code=$(mktemp)
"${CURL_BASE[@]}" "${host_header_args[@]}" \
  -H "Content-Type: application/json" \
  -X POST -d "$quote_payload" \
  -o "$tmp_resp" -w "%{http_code}" \
  "${RESTAURANT_WEB_BASE}/api/checkout/quote" > "$tmp_code" || true
http_code=$(cat "$tmp_code")
case "$http_code" in
  200)
    if jq -e '.quote.totalRon' "$tmp_resp" >/dev/null 2>&1; then
      ok "/api/checkout/quote -> 200 + quote.totalRon present"
    else
      fail "/api/checkout/quote -> 200 but quote.totalRon missing"
    fi
    ;;
  422)
    if jq -e '.error == "quote_failed"' "$tmp_resp" >/dev/null 2>&1; then
      ok "/api/checkout/quote -> 422 quote_failed (route alive; pass SAMPLE_ITEM_ID for full check)"
    else
      fail "/api/checkout/quote -> 422 but body is not quote_failed"
    fi
    ;;
  *)
    fail "/api/checkout/quote -> ${http_code} (expected 200 or 422)"
    ;;
esac
rm -f "$tmp_resp" "$tmp_code"

# ---- 5. Admin root ----------------------------------------------------------
step "5. GET ${ADMIN_BASE}/"
http_code=$("${CURL_BASE[@]}" -o /dev/null -w "%{http_code}" "${ADMIN_BASE}/" || echo "000")
case "$http_code" in
  200|307|302)
    ok "/  -> ${http_code}"
    ;;
  *)
    fail "/  -> ${http_code} (expected 200/302/307)"
    ;;
esac

# ---- 6. Admin /api/signup/check-slug ----------------------------------------
step "6. GET ${ADMIN_BASE}/api/signup/check-slug?slug=${TENANT_SLUG}"
tmp_resp=$(mktemp); tmp_code=$(mktemp)
"${CURL_BASE[@]}" -o "$tmp_resp" -w "%{http_code}" \
  "${ADMIN_BASE}/api/signup/check-slug?slug=${TENANT_SLUG}" > "$tmp_code" || true
http_code=$(cat "$tmp_code")
if [ "$http_code" = "200" ]; then
  if jq -e '.available == false' "$tmp_resp" >/dev/null 2>&1; then
    ok "check-slug -> 200 {available:false} (slug already taken, as expected)"
  else
    fail "check-slug -> 200 but expected {available:false}, got $(cat "$tmp_resp")"
  fi
else
  fail "check-slug -> ${http_code} (expected 200)"
fi
rm -f "$tmp_resp" "$tmp_code"

# ---- summary ----------------------------------------------------------------
echo
echo "----------------------------------------"
printf "  passed: %s%s%s\n" "$C_GRN" "$PASS_COUNT" "$C_RST"
printf "  failed: %s%s%s\n" "$C_RED" "$FAIL_COUNT" "$C_RST"
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo
  echo "  failed steps:"
  for s in "${FAILED_STEPS[@]}"; do
    printf "    %s- %s%s\n" "$C_RED" "$s" "$C_RST"
  done
  echo
  echo "RSHIR-25 smoke: FAIL"
  exit 1
fi
echo
echo "RSHIR-25 smoke: ALL OK"
exit 0
