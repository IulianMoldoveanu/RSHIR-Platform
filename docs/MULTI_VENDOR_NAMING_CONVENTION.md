# Multi-Vendor Naming Convention

**Status:** Active rule for all NEW code as of 2026-06-16.
**Scope:** This repo (`HIR for Restaurants`) plus all downstream apps (admin, web, courier, pharma).
**Origin:** Section 4 of the Strategy Master Plan (HIR Ecosystem Unification Map). The platform started as a restaurants-only product but the data layer (`courier_orders`, `tenants`, `fleet_courier_tariffs`) and the live verticals (restaurant + pharmacy, with pet/vet/retail/fito/minimarket on roadmap) are already multi-vendor. New code must not lock us back into the old single-vertical assumption.

This document only defines the rule. It does **not** retrofit old code. A separate refactor list (Section 5) tracks the existing violations for future cleanup.

---

## The five rules

### Rule 1 — New tables use `vendor_tenant_id`

When a new table references a vendor (the merchant tenant — restaurant, pharmacy, pet shop, etc.), the foreign-key column **must** be named `vendor_tenant_id`, not `restaurant_tenant_id`.

If the column references *any* tenant (vendor, fleet, reseller, customer-org), use plain `tenant_id`.

**Good:**

```sql
create table marketplace_offers (
  id uuid primary key,
  vendor_tenant_id uuid not null references tenants(id),
  ...
);
```

**Bad:**

```sql
create table marketplace_offers (
  id uuid primary key,
  restaurant_tenant_id uuid not null references tenants(id),  -- WRONG
  ...
);
```

Reference: `supabase/migrations/20260616_006_b2b_marketplace_foundation.sql` is the canonical example. Comment at line 6 makes the intent explicit.

### Rule 2 — New cron jobs are vertical-agnostic

New `pg_cron` jobs and edge-function schedules **must not** include `WHERE vertical = 'RESTAURANT'` unless the job is purpose-built for restaurant logic and would be semantically wrong for pharmacy/pet/retail.

The default query shape is:

```sql
-- Good: works for all verticals
select ... from tenants where status = 'ACTIVE';
```

If a vertical filter is genuinely required (e.g. a job that processes prescription audit logs is pharmacy-only), document the reason in a SQL comment above the cron registration.

### Rule 3 — New UI uses `tenant.brand_name` + `tenant.vertical`

Admin/web pages must never hardcode "Restaurantul ___" / "Restaurant" in copy that is rendered per-tenant. Use `tenant.brand_name` for the display name and, where wording must differ by vertical (e.g. "Farmacia X" vs "Restaurantul X"), branch on `tenant.vertical`.

**Good:**

```tsx
<h1>{tenant.brand_name}</h1>
<p>{tenant.vertical === 'PHARMACY' ? 'Farmacia' : 'Restaurantul'} este LIVE.</p>
```

**Bad:**

```tsx
<h1>Restaurantul {tenant.brand_name}</h1>           // hardcoded vertical
<p>Restaurantul dumneavoastră a fost activat.</p>   // hardcoded vertical
```

Static marketing/legal pages aimed at the restaurant audience are not affected by this rule — they live under `app/(storefront)`, `app/(legal)`, `app/parteneriat`, etc.

### Rule 4 — New API endpoints use `/api/vendors/*`

New REST routes for vendor-scoped resources **must** be mounted under `/api/vendors/*`, not `/api/restaurants/*`.

**Good:** `POST /api/vendors/{id}/menu`, `GET /api/vendors/{id}/orders`
**Bad:** `POST /api/restaurants/{id}/menu`

The repo currently has **zero** `/api/restaurants/*` routes (audit confirmed — see Section 5). Keep it that way.

### Rule 5 — New email templates use `tenant.brand_name`

Email/SMS/push templates **must** interpolate `brand_name` rather than say "Restaurant"/"Restaurantul". Vertical-specific copy is OK if branched explicitly (see Rule 3), but the default greeting should read naturally for any merchant.

**Good:**

```ts
subject: `${tenant.brand_name} are o comandă nouă`
```

**Bad:**

```ts
subject: `Restaurantul ${tenant.brand_name} are o comandă nouă`
```

---

## Reference points

- **Strategy Master Plan — Section 4** (HIR Ecosystem Unification Map): mandates the multi-vendor lens for all new build.
- **`courier_orders.vertical` enum** (existing): the data layer already supports `restaurant`, `pharmacy`. New verticals are added by extending this enum, not by forking tables.
- **`supabase/migrations/20260616_006_b2b_marketplace_foundation.sql`**: the first migration that codifies `vendor_tenant_id`. Use as template.

---

## Enforcement (ESLint custom rule — DEFERRED)

A custom ESLint rule to catch hardcoded "Restaurantul "/`restaurant_tenant_id` patterns was scoped out for this pass — the AST work and false-positive tuning (legal pages, marketing copy, existing migration replays) outweigh the current marginal cost of a human review. For now this convention is enforced by:

1. **PR review checklist** — reviewer scans new migrations + new UI for the five rules.
2. **Grep at PR time** — `grep -rn "restaurant_tenant_id" supabase/migrations/20260616_*` on the diff.
3. **This doc** linked from `CLAUDE.md` so future agents see it before building.

Re-evaluate the ESLint rule once `> 5` violations slip through review.

---

## Section 5 — Pre-existing violations (refactor list, DO NOT change now)

These are flagged for visibility, **not** for this PR. Each is safe in production today; the goal is to track debt so we don't accidentally extend it.

**Audit method:** ripgrep over `supabase/migrations/` and `apps/` for the four target patterns. Counts as of 2026-06-16.

### Summary

| Pattern | Files | Notes |
|---|---|---|
| `restaurant_tenant_id` (SQL) | 4 migrations | All pre-existing tables (`fleet_restaurant_assignments`, etc.); rename = breaking schema change, do not touch. |
| `/api/restaurants/*` (routes) | **0** | Clean. Keep it that way. |
| `vertical = 'RESTAURANT'` (cron/views) | 2 migrations | One default seed (acceptable), one view filter (`v_growth_targets`). |
| Hardcoded "Restaurant"/"Restaurantul" in tenant-rendered copy | ~7 admin files (subset of 41 total grep hits, after excluding legal/marketing/static pages) | Migrate to `brand_name` + `vertical` branch when those screens get reworked. |

### Top 5 violations (sample, for the future refactor backlog)

1. **`apps/restaurant-admin/src/lib/email/templates.ts:120,135,175,188`**
   Reseller partner emails interpolate `Restaurantul ${input.tenantName}` directly. Hard-codes the vertical in the most reseller-visible touchpoint — and the partner portal already serves pharmacy referrers. Replace with `brand_name` + `vertical` branch when partner-portal email pass happens.

2. **`apps/restaurant-admin/src/app/dashboard/go-live-celebration.tsx:86`**
   `"Restaurantul dumneavoastră a fost activat cu succes."` — go-live celebration screen. Shown to pharmacy tenants today via the same admin shell. Replace with `vertical`-aware copy.

3. **`apps/restaurant-admin/src/app/partner-portal/_components/notification-settings.tsx`** (2 occurrences)
   Partner-portal notification preferences copy. Same blast radius as #1 — resellers see this regardless of which vertical they brought in.

4. **`supabase/migrations/20260504_006_growth_agent.sql:275`**
   `where t.vertical = 'RESTAURANT'` in the `v_growth_targets` view. Pharmacy tenants are silently excluded from growth-agent targeting. Either drop the filter or add an explicit pharmacy view alongside.

5. **`apps/restaurant-admin/src/lib/email/templates.ts`** (14 total `Restaurant` occurrences in this one file)
   Beyond the four `Restaurantul ${tenantName}` lines, the surrounding subject/body strings also reference "Restaurant" in fixed text. Whole file deserves a vertical-aware rewrite when email templates are next opened.

### Acceptable / "leave alone"

- Pre-existing `restaurant_tenant_id` columns on `fleet_restaurant_assignments` and similar tables — renaming = destructive schema migration with no functional gain.
- Legal pages, marketing pages, `parteneriat`, `oferta-flota`, courier `force-end-shift`, app shell `layout.tsx` (`"HIR Restaurant"` brand) — these speak directly to the restaurant audience or are part of the product brand and are out of scope for this convention.
- The default `vertical='restaurant'` in `courier_orders` (line 127 of `20260429_002_courier_unification_phase_a.sql`) — historical backfill, not a filter.

---

## Stream 1 verification

The `20260616_006_b2b_marketplace_foundation.sql` migration (Stream 1 — marketplace tables) was checked against this convention:

- `vendor_tenant_id` used (3 occurrences across the new tables). **PASS Rule 1.**
- `vertical text NOT NULL DEFAULT 'restaurant'` on `marketplace_offers` — column present, no `WHERE vertical = 'RESTAURANT'` filter anywhere. **PASS Rule 2.**
- Header comment line 6 documents the choice explicitly. **Good practice — replicate in future migrations.**

No corrective action needed.
