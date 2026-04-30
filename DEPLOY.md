# DEPLOY.md — HIR Restaurant Suite

Operator runbook for shipping `restaurant-web` and `restaurant-admin` to
Vercel and the `notify-new-order` Edge Function to Supabase. Scope: pilot
launch (Farmacia TEI / first restaurant tenants). Push-to-deploy via
Vercel Git integration; no GitHub Actions yet.

## Prerequisites

- **Vercel paid plan** active (Pro is what unlocks the Domains API used
  by RSHIR-12 to attach custom storefront domains).
- **Supabase project** `qfmeojeipncuxeltnvab` (`eu-central-1` Frankfurt)
  with all migrations applied — see `supabase/migrations/`.
- **Resend account** with the `hir.ro` sender domain verified (or fall
  back to `onboarding@resend.dev` for early pilot).
- **Stripe** account with both test and live keys.
- **Anthropic API key** (`sk-ant-...`) for AI menu import.
- Local tools: `pnpm` 10.x, `node` ≥ 20, `supabase` CLI, `curl`, `jq`.

## One-time Vercel project setup

Create two separate Vercel projects, both pointing at the same monorepo
on the `main` branch.

### Project A — `hir-restaurant-web`

| Setting | Value |
|---|---|
| **Root directory** | `apps/restaurant-web` |
| **Framework preset** | Next.js |
| **Install command** | `pnpm install --frozen-lockfile` (set in `vercel.json`) |
| **Build command** | `pnpm build` (set in `vercel.json`) |
| **Output directory** | (default: `.next`) |
| **Node version** | 20.x |

Environment variables — copy every key from
`apps/restaurant-web/.env.local.example` into Production + Preview. The
example file is the source of truth. At minimum:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET` (use **live** keys for Production, **test**
  for Preview)
- `HIR_DELIVERY_API_BASE_URL`, `HIR_DELIVERY_API_KEY`

### Project B — `hir-restaurant-admin`

| Setting | Value |
|---|---|
| **Root directory** | `apps/restaurant-admin` |
| **Framework preset** | Next.js |
| **Install command** | `pnpm install --frozen-lockfile` (set in `vercel.json`) |
| **Build command** | `pnpm build` (set in `vercel.json`) |
| **Output directory** | (default: `.next`) |
| **Node version** | 20.x |

Environment variables — copy every key from
`apps/restaurant-admin/.env.local.example`. Notes:

- `VERCEL_PROJECT_ID` — paste the **`hir-restaurant-web`** project id
  here (not the admin project's id). The admin app uses it to attach
  custom storefront domains to the storefront app on tenants' behalf.
- `VERCEL_TOKEN` — generate at vercel.com → Account Settings → Tokens.
- `ALLOWED_ORIGINS` — set to `https://admin.hir.ro` (and any preview
  alias). `assertSameOrigin` rejects every mutation when this is unset.
- `TRUST_PROXY` — leave unset on Vercel (`req.ip` is authoritative).
- `RESEND_*`, `HIR_NOTIFY_SECRET`, `NEXT_PUBLIC_ADMIN_BASE_URL` — these
  live as **Supabase function secrets**, not Next.js env. Documented in
  the example file for ops handoff.

## Custom storefront domains (RSHIR-12)

Per-tenant custom domains are attached programmatically through the
Vercel Domains API.

Operator flow:

1. Tenant adds the domain in `restaurant-admin` → **Setări → Domeniu**.
2. The wizard inserts a `tenants.custom_domain` row and calls Vercel's
   `POST /v10/projects/{id}/domains`.
3. Vercel returns the DNS records the tenant must publish at their
   registrar (typically a `CNAME` to `cname.vercel-dns.com`).
4. **The tenant adds those records manually at their DNS provider.**
   This step is unavoidable and the wizard explicitly waits for it.
5. The wizard polls `GET /v10/projects/{id}/domains/{domain}` every few
   seconds and flips the UI to "verified" once Vercel confirms the
   apex/CNAME records resolve. Issuance of the cert happens automatically
   after verification.

If the wizard returns `vercel_not_configured`, `VERCEL_TOKEN` /
`VERCEL_PROJECT_ID` are missing on the **admin** project — fix env, then
redeploy the admin app.

## Web Push — VAPID key provisioning (Phase C)

The courier app supports Web Push notifications via `courier-push-register` and
`courier-push-dispatch` Edge Functions. **VAPID signing is implemented** —
provision keys then deploy:

### 1. Generate a VAPID key pair (one-time per environment)

```sh
npx web-push generate-vapid-keys
```

Copy the output:
```
Public Key: <base64url>
Private Key: <base64url>
```

### 2. Set Supabase Edge Function secrets

```sh
supabase secrets set VAPID_PUBLIC_KEY=<public-key> \
  --project-ref qfmeojeipncuxeltnvab
supabase secrets set VAPID_PRIVATE_KEY=<private-key> \
  --project-ref qfmeojeipncuxeltnvab
supabase secrets set VAPID_SUBJECT=mailto:courier@hiraisolutions.ro \
  --project-ref qfmeojeipncuxeltnvab
```

### 3. Set the Next.js env var

Add to `apps/restaurant-courier/.env.local` (and Vercel project env):
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same-public-key>
```

### 4. Deploy Edge Functions

```sh
pnpm node supabase/deploy-function.mjs courier-push-register
pnpm node supabase/deploy-function.mjs courier-push-dispatch
```

### 5. Smoke-test the dispatch

After deploying, send a manual push to verify signing works end-to-end:

```sh
curl -X POST \
  https://qfmeojeipncuxeltnvab.supabase.co/functions/v1/courier-push-dispatch \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"fleet_id":"<fleet-uuid>","order_id":"<order-uuid>",
       "title":"Test","body":"VAPID smoke test"}'
```

Successful response: `{"ok":true,"sent":N,"pruned":0,"failed":0,"total":N}`.
A 410/404 from any subscription endpoint is auto-pruned from
`courier_push_subscriptions`.

If you see `vapid_not_configured`, the secrets above are missing.

---

## Edge Function deploy

Functions:
- `notify-new-order` — RSHIR-18, sends owner email when an order is paid.
- `daily-digest` — RSHIR-35, daily revenue summary at 07:00 UTC.
- `review-reminder` — RSHIR-43, hourly nudge to /track for unrated paid
  orders aged 24-30h.
- `partner-commission-calc` — monthly partner commission rollup at
  01:00 UTC on day 2. Deploy + secrets + manual triggers documented in
  `supabase/functions/partner-commission-calc/README.md`.

```sh
# 1. Deploy each function's code
pnpm node supabase/deploy-function.mjs notify-new-order
pnpm node supabase/deploy-function.mjs daily-digest
pnpm node supabase/deploy-function.mjs review-reminder

# 2. Set the function secrets (one-time per project; rotate on schedule).
#    See supabase/README.md for the full RSHIR-22 secret-seeding script.
supabase secrets set HIR_NOTIFY_SECRET=<64-char-hex> \
  --project-ref qfmeojeipncuxeltnvab
supabase secrets set RESEND_API_KEY=<resend-key> \
  --project-ref qfmeojeipncuxeltnvab
supabase secrets set RESEND_FROM_EMAIL='HIR <orders@hir.ro>' \
  --project-ref qfmeojeipncuxeltnvab
supabase secrets set NEXT_PUBLIC_ADMIN_BASE_URL=https://admin.hir.ro \
  --project-ref qfmeojeipncuxeltnvab
supabase secrets set NEXT_PUBLIC_RESTAURANT_WEB_URL=https://hir.ro \
  --project-ref qfmeojeipncuxeltnvab
```

Also seed the matching Postgres vault rows used by the order-paid
trigger and the cron jobs to authenticate to the functions:

```sql
-- one-time, replace each URL if your project ref differs:
select vault.create_secret(
  'https://qfmeojeipncuxeltnvab.functions.supabase.co/daily-digest',
  'daily_digest_url',
  'daily-digest Edge Function URL');
select vault.create_secret(
  'https://qfmeojeipncuxeltnvab.functions.supabase.co/review-reminder',
  'review_reminder_url',
  'review-reminder Edge Function URL');
```

The shared HMAC secret (`notify_new_order_secret`) is reused by all
three functions — see
[supabase/README.md](supabase/README.md#rshir-22-notify-new-order-shared-secret).

## Smoke test

After every deploy:

```sh
RESTAURANT_WEB_BASE=https://tenant1.hir.ro \
ADMIN_BASE=https://admin.hir.ro \
TENANT_SLUG=tenant1 \
bash scripts/smoke-prod.sh
```

Exit code 0 = green. The script probes:

1. Storefront index (200 + tenant name in body).
2. `/bio` (200).
3. First `/m/<slug>` link from the index (200 + `og:title` meta).
4. `POST /api/checkout/quote` — accepts 200 with `quote.totalRon` if
   `SAMPLE_ITEM_ID` is exported, else 422 `quote_failed` (proves route +
   tenant resolution + schema validation are alive).
5. Admin `/` (200/302/307).
6. Admin `/api/signup/check-slug?slug=tenant1` (200 `{available:false}`).

## Uptime monitoring

Both apps expose `GET /api/healthz` (public, RSHIR-40). It performs a
cheap HEAD count on `tenants` and returns:

```json
{
  "ok": true,
  "app": "restaurant-web",
  "db": { "ok": true, "latencyMs": 38, "error": null },
  "totalMs": 41,
  "buildSha": "<vercel commit sha>",
  "env": "production",
  "ts": "2026-04-30T07:12:08.123Z"
}
```

HTTP 200 when healthy, 503 when the DB round-trip fails or exceeds
800ms. Wire UptimeRobot / Better Stack against:

- `https://tenant1.hir.ro/api/healthz`  (storefront)
- `https://admin.hir.ro/api/healthz`    (admin)

5-minute interval is enough for pilot. The admin middleware whitelists
`/api/healthz` so the probe is not redirected to `/login`.

## Rollback

Vercel → Project → **Deployments** → pick the prior green deployment →
`...` menu → **Promote to Production**. Instant cutover; no rebuild.

For Supabase Edge Function rollbacks: redeploy the previous `index.ts`
via `pnpm node supabase/deploy-function.mjs notify-new-order` from a
checkout of the prior commit. Edge functions don't keep a deployment
history.

## What this runbook does not cover

- CI/CD pipelines (push-to-deploy via Vercel Git is the pilot strategy).
- Monitoring / Sentry / log aggregation.
- Backup strategy (Supabase nightly backups on the Pro plan are
  sufficient for pilot).
- Load testing.
