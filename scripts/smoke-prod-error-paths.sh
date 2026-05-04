#!/usr/bin/env bash
# RSHIR — error-path smoke. Companion to scripts/smoke-prod.sh.
#
# smoke-prod.sh covers the happy path. This script covers:
#   - liveness/healthz on ALL 3 apps (web, admin, courier)
#   - 404 graceful handling on bogus item slugs
#   - input validation rejection on /api/checkout/quote
#   - admin signup endpoint rejection on empty slug
#   - courier app reachable (login page or auth redirect)
#
# Read-only, idempotent, no DB writes.
#
# Usage:
#   bash scripts/smoke-prod-error-paths.sh                                   # localhost
#   RESTAURANT_WEB_BASE=https://hir-restaurant-web.vercel.app \
#     ADMIN_BASE=https://hir-restaurant-admin.vercel.app \
#     COURIER_BASE=https://courier-beta-seven.vercel.app \
#     bash scripts/smoke-prod-error-paths.sh
#
# Exit code: 0 if every step passes, 1 otherwise.

set -u
set -o pipefail

RESTAURANT_WEB_BASE="${1:-${RESTAURANT_WEB_BASE:-http://localhost:3000}}"
ADMIN_BASE="${2:-${ADMIN_BASE:-http://localhost:3001}}"
COURIER_BASE="${3:-${COURIER_BASE:-http://localhost:3003}}"
TENANT_SLUG="${TENANT_SLUG:-tenant1}"

RESTAURANT_WEB_BASE="${RESTAURANT_WEB_BASE%/}"
ADMIN_BASE="${ADMIN_BASE%/}"
COURIER_BASE="${COURIER_BASE%/}"

for bin in curl jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "ERROR: required dependency '$bin' not found in PATH" >&2
    exit 1
  fi
done

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

host_header_args=()
case "$RESTAURANT_WEB_BASE" in
  *localhost*|*127.0.0.1*|*lvh.me*)
    host_header_args=(-H "Host: ${TENANT_SLUG}.lvh.me")
    ;;
esac

CURL=(curl --silent --show-error --max-time 15)

echo
echo "RSHIR error-path smoke"
echo "  storefront base : $RESTAURANT_WEB_BASE"
echo "  admin base      : $ADMIN_BASE"
echo "  courier base    : $COURIER_BASE"
echo "  tenant slug     : $TENANT_SLUG"
echo

# ---- 1. Liveness on all 3 apps ----------------------------------------------
for pair in "web|${RESTAURANT_WEB_BASE}" "admin|${ADMIN_BASE}" "courier|${COURIER_BASE}"; do
  name="${pair%%|*}"
  base="${pair##*|}"
  step "1.${name} GET ${base}/api/healthz"
  tmp=$(mktemp)
  http_code=$("${CURL[@]}" -o "$tmp" -w "%{http_code}" "${base}/api/healthz" || echo "000")
  if [ "$http_code" = "200" ]; then
    if jq -e '.ok == true' "$tmp" >/dev/null 2>&1; then
      latency=$(jq -r '.db.latencyMs // "n/a"' "$tmp")
      ok "${name} healthz -> 200 ok=true (db latency ${latency}ms)"
    else
      fail "${name} healthz -> 200 but body.ok != true: $(cat "$tmp")"
    fi
  elif [ "$http_code" = "503" ]; then
    fail "${name} healthz -> 503 (DB unhealthy or slow): $(cat "$tmp")"
  else
    fail "${name} healthz -> ${http_code} (expected 200)"
  fi
  rm -f "$tmp"
done

# ---- 2. 404 on bogus item slug ----------------------------------------------
step "2. GET /m/this-slug-definitely-does-not-exist-xyz123 (expect 404)"
http_code=$("${CURL[@]}" "${host_header_args[@]}" -o /dev/null -w "%{http_code}" \
  "${RESTAURANT_WEB_BASE}/m/this-slug-definitely-does-not-exist-xyz123" || echo "000")
case "$http_code" in
  404) ok "/m/<bogus> -> 404" ;;
  200) fail "/m/<bogus> -> 200 (expected 404; storefront may be returning a placeholder page)" ;;
  *)   fail "/m/<bogus> -> ${http_code} (expected 404)" ;;
esac

# ---- 3. Empty cart on /api/checkout/quote -----------------------------------
step "3. POST /api/checkout/quote with empty items (expect 4xx)"
tmp=$(mktemp); tmp_code=$(mktemp)
"${CURL[@]}" "${host_header_args[@]}" \
  -H "Content-Type: application/json" \
  -X POST -d '{"items":[],"address":{"line1":"x","city":"x","lat":45,"lng":25}}' \
  -o "$tmp" -w "%{http_code}" "${RESTAURANT_WEB_BASE}/api/checkout/quote" > "$tmp_code" || true
http_code=$(cat "$tmp_code")
case "$http_code" in
  400|422)
    ok "empty cart -> ${http_code} (rejected as expected)"
    ;;
  200)
    fail "empty cart -> 200 (validation gap; must reject empty cart)"
    ;;
  *)
    fail "empty cart -> ${http_code} (expected 400 or 422)"
    ;;
esac
rm -f "$tmp" "$tmp_code"

# ---- 4. Malformed JSON on /api/checkout/quote -------------------------------
step "4. POST /api/checkout/quote with malformed body (expect 400)"
http_code=$("${CURL[@]}" "${host_header_args[@]}" \
  -H "Content-Type: application/json" \
  -X POST -d 'not-json' \
  -o /dev/null -w "%{http_code}" \
  "${RESTAURANT_WEB_BASE}/api/checkout/quote" || echo "000")
case "$http_code" in
  400) ok "malformed JSON -> 400" ;;
  422) ok "malformed JSON -> 422 (acceptable)" ;;
  500) fail "malformed JSON -> 500 (route should reject cleanly, not crash)" ;;
  *)   fail "malformed JSON -> ${http_code} (expected 400/422)" ;;
esac

# ---- 5. Admin signup check-slug with empty slug -----------------------------
step "5. GET /api/signup/check-slug?slug= (empty)"
http_code=$("${CURL[@]}" -o /dev/null -w "%{http_code}" \
  "${ADMIN_BASE}/api/signup/check-slug?slug=" || echo "000")
case "$http_code" in
  400|422) ok "empty slug -> ${http_code} (rejected)" ;;
  200)     fail "empty slug -> 200 (validation gap)" ;;
  *)       fail "empty slug -> ${http_code} (expected 400/422)" ;;
esac

# ---- 6. Courier root reachable ---------------------------------------------
step "6. GET ${COURIER_BASE}/"
http_code=$("${CURL[@]}" -o /dev/null -w "%{http_code}" "${COURIER_BASE}/" || echo "000")
case "$http_code" in
  200|307|302)
    ok "courier / -> ${http_code} (live; auth redirect acceptable)"
    ;;
  *)
    fail "courier / -> ${http_code} (expected 200/302/307)"
    ;;
esac

# ---- 7. Courier login page --------------------------------------------------
step "7. GET ${COURIER_BASE}/login"
http_code=$("${CURL[@]}" -o /dev/null -w "%{http_code}" "${COURIER_BASE}/login" || echo "000")
if [ "$http_code" = "200" ]; then
  ok "courier /login -> 200"
else
  fail "courier /login -> ${http_code} (expected 200)"
fi

# ---- summary ---------------------------------------------------------------
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
  echo "Error-path smoke: FAIL"
  exit 1
fi
echo
echo "Error-path smoke: ALL OK"
exit 0
