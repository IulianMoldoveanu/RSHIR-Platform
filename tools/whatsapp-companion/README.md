# HIR WhatsApp Companion

Local helpers for testing the `whatsapp-webhook` Supabase Edge Function
end-to-end without hitting the real Meta Graph API.

> **Status: skeleton.** Real Meta credentials live in Supabase secrets
> (set via Mgmt API at go-live). These curl snippets exist so engineering
> can validate the handshake + HMAC ladder against a deployed (or local
> `supabase functions serve`) instance.

---

## Endpoints

- `GET /functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`
  Meta's first call during webhook setup. The function echoes
  `hub.challenge` plain-text 200 iff `hub.verify_token` matches
  `WHATSAPP_VERIFY_TOKEN`.

- `POST /functions/v1/whatsapp-webhook`
  Meta delivers events here. Body is the WhatsApp Cloud API envelope.
  Function validates `X-Hub-Signature-256` against `META_APP_SECRET`
  using HMAC-SHA256 over the **raw** body bytes.

The function is deployed with `verify_jwt = false` (per the existing
`scripts/deploy-fn-with-shared.mjs` ladder) — Meta does not send a
Supabase JWT.

---

## Required secrets (Supabase project)

| Name                     | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `WHATSAPP_ENABLED`       | Feature flag — must equal `'true'` for POST events to be processed. Default off so the URL can be installed before Meta approval. |
| `WHATSAPP_VERIFY_TOKEN`  | Arbitrary string. Paste the same value into the Meta UI during webhook subscription. |
| `META_APP_SECRET`        | App secret from Meta App Dashboard → Settings → Basic. Used as the HMAC key. |
| `WHATSAPP_ACCESS_TOKEN`  | Long-lived system-user token. Used to send replies via the Graph API. |
| `WHATSAPP_PHONE_ID`      | Numeric Phone Number ID from Meta. |

When `WHATSAPP_ENABLED !== 'true'` the POST handler returns `503
whatsapp_disabled` (Meta retries — preferred over 4xx). When any of the
three secrets above are missing it returns `503 whatsapp_secrets_missing`.

---

## Curl: verify GET handshake

```bash
FN_URL="https://<project-ref>.functions.supabase.co/whatsapp-webhook"
TOKEN="<value of WHATSAPP_VERIFY_TOKEN>"

curl -sS -i \
  "$FN_URL?hub.mode=subscribe&hub.verify_token=$TOKEN&hub.challenge=ping123"
# expect: HTTP/1.1 200 + body: ping123
```

Wrong token:

```bash
curl -sS -i "$FN_URL?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=ping123"
# expect: HTTP/1.1 403 + body: forbidden
```

---

## Curl: sign + POST an event

The HMAC key is `META_APP_SECRET`. Signature header format is
`sha256=<hex>` over the **raw** body bytes (NOT a normalised JSON
re-encoding).

```bash
FN_URL="https://<project-ref>.functions.supabase.co/whatsapp-webhook"
APP_SECRET="<value of META_APP_SECRET>"

BODY='{"object":"whatsapp_business_account","entry":[{"id":"123","changes":[{"value":{"messaging_product":"whatsapp","messages":[{"from":"40711222333","id":"wamid.test","type":"text","text":{"body":"ajutor"}}]},"field":"messages"}]}]}'

SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$APP_SECRET" -hex | awk '{print $2}')"

curl -sS -i \
  -X POST "$FN_URL" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIG" \
  --data-binary "$BODY"
# expect: HTTP/1.1 200 + {"ok":true,...}
```

Bad signature:

```bash
curl -sS -i \
  -X POST "$FN_URL" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$(printf 'a%.0s' {1..64})" \
  --data-binary "$BODY"
# expect: HTTP/1.1 401 {"error":"invalid_signature"}
```

Missing signature:

```bash
curl -sS -i \
  -X POST "$FN_URL" \
  -H "Content-Type: application/json" \
  --data-binary "$BODY"
# expect: HTTP/1.1 401 {"error":"invalid_signature"}
```

Malformed JSON (signed correctly):

```bash
BAD='not-json{'
SIG="sha256=$(printf '%s' "$BAD" | openssl dgst -sha256 -hmac "$APP_SECRET" -hex | awk '{print $2}')"
curl -sS -i -X POST "$FN_URL" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIG" \
  --data-binary "$BAD"
# expect: HTTP/1.1 400 {"error":"invalid_json"}
```

Disabled (flag off):

```bash
# When WHATSAPP_ENABLED is unset or != 'true', POST always returns 503
# BEFORE signature validation — Meta retries until the operator flips it.
# expect: HTTP/1.1 503 {"error":"whatsapp_disabled"}
```

---

## Local dev (supabase functions serve)

```bash
# Project root
supabase functions serve whatsapp-webhook --no-verify-jwt \
  --env-file ./supabase/functions/.env.local

# Then point FN_URL at http://127.0.0.1:54321/functions/v1/whatsapp-webhook
```

`./supabase/functions/.env.local` (gitignored):

```
WHATSAPP_ENABLED=true
WHATSAPP_VERIFY_TOKEN=local-test-token
META_APP_SECRET=local-test-secret
WHATSAPP_ACCESS_TOKEN=stub-not-used-when-disabled
WHATSAPP_PHONE_ID=000000000000000
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<local service role>
```

The function will attempt outbound sends to `graph.facebook.com` once a
valid event is received — for local-only dry runs, point a local stub
server at the Graph URL via `/etc/hosts` or test against a sandbox
Meta phone number ID.

---

## Reference

- Webhook function: `supabase/functions/whatsapp-webhook/index.ts`
- Pure helpers (tested under vitest):
  `supabase/functions/_shared/whatsapp.ts`
- Tests:
  `apps/restaurant-admin/src/lib/whatsapp/whatsapp-helpers.test.ts`
- Meta docs:
  - <https://developers.facebook.com/docs/graph-api/webhooks/getting-started>
  - <https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples>
