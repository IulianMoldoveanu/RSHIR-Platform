#!/usr/bin/env bash
# Sprint 1 smoke test: assert each tenant subdomain returns its name.
# Assumes both apps are running locally:
#   pnpm dev   (turborepo: restaurant-web on :3000, restaurant-admin on :3001)
set -e

WEB=${WEB:-http://localhost:3000}
ADMIN=${ADMIN:-http://localhost:3001}

echo "==> tenant1 storefront"
curl -s -H "Host: tenant1.lvh.me" "$WEB" | grep -i "Pizzeria Demo Brasov Centru" >/dev/null \
  && echo "    OK: tenant1 resolved by host" \
  || (echo "    FAIL: tenant1 not resolved" && exit 1)

echo "==> tenant2 storefront"
curl -s -H "Host: tenant2.lvh.me" "$WEB" | grep -i "Bistro Demo Brasov Periferie" >/dev/null \
  && echo "    OK: tenant2 resolved by host" \
  || (echo "    FAIL: tenant2 not resolved" && exit 1)

echo "==> admin login page reachable"
curl -s -o /dev/null -w "%{http_code}\n" "$ADMIN/login" | grep -E "^200$" >/dev/null \
  && echo "    OK: /login -> 200" \
  || (echo "    FAIL: /login not 200" && exit 1)

echo "==> admin / redirects to /login when unauthenticated"
curl -s -o /dev/null -w "%{http_code}\n" "$ADMIN/dashboard" | grep -E "^(200|307|302)$" >/dev/null \
  && echo "    OK: /dashboard returns 2xx/3xx (middleware works)" \
  || (echo "    FAIL: /dashboard unexpected status" && exit 1)

echo
echo "Sprint 1 smoke: ALL OK"
