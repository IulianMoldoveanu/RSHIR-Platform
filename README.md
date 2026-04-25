# HIR Platform — Restaurant Suite

Multi-tenant SaaS that gives Romanian restaurants their own ordering site with integrated delivery (powered by HIR's courier fleet, served by `pharmacy-saas-phase1` over a public API).

## Quick start

```bash
pnpm install
pnpm dev
```

This boots both apps via Turborepo:

| App | Port | URL |
|---|---|---|
| `restaurant-web`  | 3000 | http://tenant1.lvh.me:3000 / http://tenant2.lvh.me:3000 |
| `restaurant-admin`| 3001 | http://localhost:3001 |

`lvh.me` resolves to `127.0.0.1` — used to test multi-tenant host routing without editing `/etc/hosts`.

### Admin login

```
email:    admin@hir.local
password: RSHIRdev2026
```

The admin user is OWNER of both demo tenants (`tenant1`, `tenant2`) and is seeded by `supabase/seed-admin.mjs`.

## Structure

```
hir-platform/
  apps/
    restaurant-web/      Public storefront (per-tenant via host routing)
    restaurant-admin/    Tenant dashboard (sidebar nav, tenant selector, logout)
  packages/
    ui/                  Shared shadcn-style components (zinc palette) + Tailwind preset
    supabase-types/      Generated Database type + createBrowserSupabase / createServerSupabase
    delivery-client/     Typed HTTP client for HIR Delivery API (Sprint 4 wires the impl)
    config-tsconfig/     Shared tsconfig presets
    config-eslint/       Shared flat ESLint preset
  supabase/
    migrations/          Versioned DDL (applied via supabase/apply-sql.mjs)
    functions/           Edge functions (Sprint 2+)
    seed.sql             2 demo tenants + 1 category + 3 menu items each
    seed-admin.mjs       Creates admin auth user + memberships
    apply-sql.mjs        Helper: POST a .sql file to the Supabase Management API
    gen-types.mjs        Helper: regenerate packages/supabase-types/src/database.types.ts
```

## Multi-tenant routing

`apps/restaurant-web/src/middleware.ts` strips the request host's port and forwards `x-hir-host` / `x-hir-tenant-slug` headers. The page resolves the tenant in this order:

1. `tenants.custom_domain = host` (e.g. `tenant1.lvh.me`)
2. `tenants.slug = host.split('.')[0]` (e.g. `tenant1`)

Unmatched hosts render `app/not-found.tsx`.

## Adding a tenant manually

```sql
insert into public.tenants (slug, name, vertical, custom_domain, status)
values ('mychef', 'My Chef Brașov', 'RESTAURANT', 'mychef.lvh.me', 'ACTIVE');
```

Apply via `node supabase/apply-sql.mjs <file>` or the Supabase SQL editor.

## Production

Pilot deploy targets Vercel (push-to-deploy from `main`) + Supabase Edge
Functions. The full operator runbook — Vercel project setup, custom-domain
attach flow, Edge Function deploy, smoke checks, rollback — lives in
[DEPLOY.md](DEPLOY.md).

Quick post-deploy verification:

```bash
RESTAURANT_WEB_BASE=https://tenant1.hir.ro \
ADMIN_BASE=https://admin.hir.ro \
bash scripts/smoke-prod.sh
```

## Scripts

Helpers under `supabase/` (Postgres + Edge Functions ops):

- `apply-sql.mjs <file.sql>` — POSTs SQL to the Supabase Management API.
- `deploy-function.mjs <name>` — uploads `functions/<name>/index.ts`.
- `gen-types.mjs` — regenerates `packages/supabase-types/src/database.types.ts`.
- `seed-admin.mjs` — seeds the bootstrap super-admin auth user.

Helpers under `scripts/` (release verification):

- `smoke.sh` — sprint-1 multi-tenant routing smoke test (local dev).
- `smoke-prod.sh` — RSHIR-25 production smoke test (storefront index,
  `/bio`, `/m/<slug>` + `og:title`, checkout quote API, admin root,
  signup slug check).

## Stack

- **Next.js 14** App Router, TypeScript strict, server actions
- **Tailwind 3** + zinc-palette **shadcn**-style components (no CSS vars in MVP)
- **Supabase**: Postgres + RLS + Auth + Realtime + Storage + Edge Functions
- **Postgres**: project `qfmeojeipncuxeltnvab` (`eu-central-1` Frankfurt)
- **pnpm + Turborepo**, **Zod**, `useState`-controlled forms (no RHF in MVP)

## Status (last updated 2026-04-25)

7 sprints + 5 hardening passes shipped on `main`. Both apps compile (`pnpm
build`) and typecheck clean (`pnpm -r typecheck`). Pilot-readiness work
ongoing — see `## Sprint history` below for the full log.

| Sprint | Theme | Tasks | Status |
|---|---|---|---|
| 1 | Foundation | RSHIR-1..6 | done |
| 2 | Menu + storefront + checkout | RSHIR-7..14 | done |
| 3 | Bio + AI menu + dispatch | RSHIR-15..18 | done |
| 4 | Operations + email + sec | RSHIR-19..22 | done |
| 5 | Onboarding + bilingual + deploy + sec | RSHIR-23..26 | done |
| 6 | GDPR + branding + pickup + KDS + sec | RSHIR-27..32 | done |
| 7 | Promo + favorites + digest + SEO + sec | RSHIR-33..37 | done |
| 8 | Pilot dry-run + deploy fixes + reviews | RSHIR-38, RSHIR-39 | in progress |

Zero CRITICAL/HIGH security debt across all sprints (each post-sprint
audit closed by a same-sprint hotfix RSHIR-26/31/32/37).

### What works end-to-end

- Multi-tenant host routing (`*.lvh.me` local, `*.hir.ro` prod), tenant
  signup wizard, OWNER/STAFF roles per tenant.
- Customer storefront: menu browse, real-time availability, cart, Stripe
  test checkout, address validation, polygonal delivery zones, pickup
  option, customer recognition cookie + `/account` history + 1-tap
  repeat order, promo codes (atomic redemption), bilingual RO+EN.
- Tenant admin: menu CRUD (+ AI photo/PDF import), categories + modifiers,
  CSV bulk import, orders queue + cancel/transition state machine, KDS
  tablet view, branding (logo + cover + brand color), domain attach
  (Vercel API), opening hours + storefront block-when-closed,
  notifications opt-out, daily revenue digest email, SEO meta + sitemap,
  GDPR DSR endpoints, cookie consent banner.
- Customer reviews: 1-5 stars + optional comment, submitted from
  `/track/<token>` after delivery (token-gated SECURITY DEFINER RPC,
  IP rate-limited). Tenant homepage shows `★ avg (count)` and emits
  `aggregateRating` JSON-LD when ≥1 review exists.
- Operational: Resend new-order email via Edge Function, pg_cron daily
  digest, Supabase Realtime menu + orders, structured-data JSON-LD per
  item, robots.txt + per-tenant sitemap, RLS isolation tests.

### Known gaps before public pilot launch

- No GitHub remote on `hir-platform/` — Vercel push-to-deploy needs one.
  See `DEPLOY.md` for the post-remote setup.
- `vercel.json` not yet validated against a real Vercel project.
- DNS for `tenant1.hir.ro` / `tenant2.hir.ro` / `admin.hir.ro` /
  `hir.ro` not yet provisioned.
- Sentry / observability not wired (deferred to Sprint 9).
