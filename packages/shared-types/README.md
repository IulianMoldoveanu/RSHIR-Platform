# @hir/shared-types

Cross-app, cross-vertical TypeScript contracts for the HIR platform.

## Purpose

This package centralizes the small, stable set of TypeScript interfaces that
multiple HIR apps need to agree on:

- **identity** — `VendorTenant`, `FleetIdentity`, `CourierIdentity`
- **multi-vendor** — `Vertical` taxonomy + helpers
- **order** — `UnifiedOrder` (cross-vertical normalized view), `OrderStatus`,
  `OrderSource`
- **payment** — `PaymentLeg` (3-legs settlement), `PaymentStatus`,
  `MoneyAmount` (integer bani)
- **marketplace** — `MarketplaceListing`, `MarketplaceOffer`,
  `MarketplaceMatch`
- **ai** — `AIJob`, `AIJobType`
- **hepi** — orchestrator propose/confirm/execute envelope

These are **pure TypeScript contracts**: no runtime SDK imports, no Supabase
client code, no DOM/Node coupling. Database row types continue to live in
`@hir/supabase-types`; this package is the *semantic* view, not the storage
view.

## Why a separate package?

We have multiple apps (restaurant-admin, courier app, pharma apps, partner
portal, …) and multiple edge functions that all need to talk about the same
core objects (an order, a payment, a courier). Without a shared contract,
each app drifts and we end up casting `as any` at every boundary.

This package replaces those casts with a single import.

## Status: SKELETON

This package currently has **zero consumers**. It is being seeded ahead of
the marketplace + AI build so that the new code in those streams can import
from a stable home from day one.

## Future consumer plan

Phased adoption (do **not** rewrite existing imports defensively):

1. **New code first** — marketplace tables, AI job tables, and Hepi mirror
   surfaces import from here as they land.
2. **Boundary code next** — edge functions (`supabase/functions/*`) that
   marshal data between apps switch to these contracts. Edge functions
   currently re-declare DTOs inline; that ends.
3. **Existing apps last** — partner-portal, dispatch console, courier app
   adopt the unified types where they currently use `any`. Done in small
   PRs, file by file, only when touching that file for another reason.
   No big-bang rewrite. Per CLAUDE.md anti-regression: surgical changes
   only.

## Build

```
pnpm --filter @hir/shared-types build       # emit dist/
pnpm --filter @hir/shared-types typecheck   # noEmit verify
pnpm --filter @hir/shared-types clean       # rm dist/
```

The `dist/` output ships `.js` (effectively empty — pure types) plus `.d.ts`
declarations, matching the `main` / `types` fields in `package.json`.

## Conventions

- All ID fields are `Uuid` (lowercase canonical UUID string).
- All timestamps are `IsoTimestamp` (ISO-8601 UTC string).
- All money fields are `MoneyAmount` (integer `amountBani` + `currency`).
  **Never** float math for money.
- Verticals are the `Vertical` union; never invent strings ad-hoc.
- Order/payment lifecycles are explicit string unions, not free strings.
- Interfaces are `readonly` by default — these are wire contracts, not
  mutable working state.

## Naming note

`@hir/supabase-types` exists separately and holds generated row types from
the Supabase schema. The two packages do **not** import each other:

- `@hir/supabase-types` = "what the database row literally looks like"
- `@hir/shared-types` = "what the platform agrees an order/payment/etc. is"

Pick the one that matches your layer.
