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
