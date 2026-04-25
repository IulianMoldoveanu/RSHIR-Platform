#!/usr/bin/env bash
# usage: poll-deploy.sh <label> <deployment_id>
LABEL=$1
DPL=$2
TOKEN=$VERCEL_TOKEN
while true; do
  S=$(curl -sS -H "Authorization: Bearer $TOKEN" "https://api.vercel.com/v13/deployments/$DPL" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('readyState','?'))" 2>/dev/null)
  echo "[$LABEL $(date +%H:%M:%S)] $S"
  case "$S" in
    READY|ERROR|CANCELED) break ;;
  esac
  sleep 10
done
