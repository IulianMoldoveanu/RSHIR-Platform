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

## Edge Function deploy (`notify-new-order`)

```sh
# 1. Deploy the function code
pnpm node supabase/deploy-function.mjs notify-new-order

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

Also seed the matching Postgres vault row used by the order-paid
trigger to authenticate to the function — see
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
