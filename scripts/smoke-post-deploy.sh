#!/usr/bin/env bash
# Post-deploy smoke test for HIR — hits 10 critical surfaces and exits
# non-zero if any returns != 200. Run after every Vercel deploy to catch
# regressions before the next user click.
#
# Usage:
#   bash scripts/smoke-post-deploy.sh
#
# Exit 0 = all green. Exit 1 = at least one endpoint broken.
# 2026-06-15 — Iulian directive: "totul trebuie sa mearga fluid. cand
# rezolvam un bug nu trebuie sa apara altul" — this is the floor catch.

set -u

UA='hir-smoke-post-deploy/1.0'
fail=0
ok=0

check() {
  local name="$1" url="$2" expected="${3:-200}"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "User-Agent: $UA" --max-time 15 "$url" || echo 000)
  if [[ "$code" == "$expected" ]]; then
    printf '  \033[32mOK\033[0m   %s -> %s (%s)\n' "$code" "$name" "$url"
    ok=$((ok + 1))
  else
    printf '  \033[31mFAIL\033[0m %s -> %s (%s) expected %s\n' "$code" "$name" "$url" "$expected"
    fail=$((fail + 1))
  fi
}

echo "=== HIR post-deploy smoke ==="

# Marketing + landing
check 'Marketing landing'          'https://hirforyou.ro/'
check 'Orase index'                'https://hirforyou.ro/orase'
check 'Orase / Bucuresti'          'https://hirforyou.ro/orase/bucuresti'
check 'Storefront foisorul-a'      'https://foisorul-a.hirforyou.ro/'

# Admin auth gates
check 'Admin login'                'https://app.hirforyou.ro/login'
check 'Admin fleet-signup'         'https://app.hirforyou.ro/fleet-signup'
check 'Admin tenant signup'        'https://app.hirforyou.ro/signup'
check 'Admin forgot password'      'https://app.hirforyou.ro/login/forgot'

# Courier app
check 'Courier login'              'https://courier.hirforyou.ro/login'

# Health
check 'Admin healthz'              'https://app.hirforyou.ro/api/healthz'

echo ""
echo "=== Result: $ok ok, $fail fail ==="
if [[ $fail -gt 0 ]]; then
  echo "ATTENTION — at least one critical surface is broken. Investigate before next merge."
  exit 1
fi
echo "All green."
exit 0
