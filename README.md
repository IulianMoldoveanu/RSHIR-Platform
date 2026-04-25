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

## Sprint 1 status (this branch)

| Task | Status |
|---|---|
| RSHIR-1 Turborepo foundation | done |
| RSHIR-2 Supabase schema + RLS + seed | done |
| RSHIR-3 Shared packages | done |
| RSHIR-4 restaurant-web scaffold | done |
| RSHIR-5 restaurant-admin scaffold | done |
| RSHIR-6 End-to-end verification | done |

Sprint 2 will add: menu CRUD, customer storefront, cart, checkout, Stripe test mode, analytics, Vercel Domains automation, AI menu import.

## Sprint 2 — Menu module (RSHIR-7)

`apps/restaurant-admin/src/app/dashboard/menu/` ships full menu management for the active tenant:

- **Categories** — create, rename, soft-delete (toggle `is_active`), reorder via drag-handle (persists `sort_order`).
- **Items** — full CRUD with image upload to Supabase Storage bucket `menu-images` at path `{tenant_id}/{item_id}.{ext}`, tag input, category filter, name search, per-row availability toggle, bulk availability toggle for multi-select.
- **Modifiers** — per-item add/edit/delete with `price_delta_ron`.
- **Realtime availability** — every flip of `is_available` (single or bulk) inserts into `menu_events` so RSHIR-9's storefront receives a Supabase Realtime row and can hide/show the item live.
- **CSV bulk import** — paste-CSV button accepting `name,description,price,category` rows; missing categories are auto-created.

All mutations are server actions that re-verify `tenant_members` membership before using the service-role client. Forms use Zod schemas in `schemas.ts`.

The storage bucket + its tenant-scoped RLS lives in `supabase/migrations/20260425_100_menu_storage.sql` (applied to project `qfmeojeipncuxeltnvab`).
