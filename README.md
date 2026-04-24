# HIR Platform — Restaurant Suite

Multi-tenant SaaS that gives Romanian restaurants their own ordering site with integrated delivery (powered by HIR's courier fleet).

## Structure

```
hir-platform/
  apps/
    restaurant-web/      Public storefront (per-tenant via host routing)
    restaurant-admin/    Tenant dashboard (menu CRUD, orders, analytics)
  packages/
    ui/                  Shared shadcn/ui components + Tailwind preset
    supabase-types/      Generated DB types + SSR client factories
    delivery-client/     Typed HTTP client for HIR Delivery API (pharmacy-saas-phase1 public API)
    config-tsconfig/     Shared tsconfig presets
    config-eslint/       Shared ESLint presets
  supabase/
    migrations/          Versioned DDL applied to project qfmeojeipncuxeltnvab
    functions/           Edge functions
    seed.sql             Demo tenants + menu items
```

## Quick start

```bash
pnpm install
pnpm dev
```

## URLs (local)

- Tenant 1 storefront: http://tenant1.lvh.me:3000
- Tenant 2 storefront: http://tenant2.lvh.me:3000
- Admin dashboard:    http://localhost:3001

`lvh.me` resolves to 127.0.0.1 — used to test multi-tenant host routing without editing /etc/hosts.

## Stack

Next.js 14 App Router, TypeScript strict, Tailwind, shadcn/ui, Supabase (Auth + Postgres + RLS + Realtime + Storage + Edge Functions), pnpm + Turborepo, Zod, react-hook-form, Zustand, React Query.
