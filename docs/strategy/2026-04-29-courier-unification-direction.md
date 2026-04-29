# Courier App Unification — Direction Locked 2026-04-29

**Owner decision (2026-04-29):** ONE unified courier app for BOTH pharma + restaurant verticals. NOT two separate apps. Construction started immediately.

---

## TL;DR for any agent / developer touching either backend

- **Build courier features ONLY in `apps/restaurant-courier/`** (this repo, RSHIR-Platform).
- **Do NOT add features to `pharmacy-saas-phase1/apps/courier/`** (the old pharma courier). It is in **freeze**: critical bug fixes only, until TEI signs.
- **Pharma backend stays canonical** for orders, prescriptions, RX validation, B2B settlements. We do not migrate it. Sync into Supabase additively via webhook.
- **Multi-tenant isolation** between fleet operators is solved by `courier_fleets` + RLS + (new) `allowed_verticals` + `tier`. NOT by separate apps.

---

## Why one app

1. The owner wanted this from day 1. Splitting into two was an execution mistake during the restaurant pilot rush, not a strategic call.
2. The defining moat is "courier carries pharma + restaurant in same shift" (per `docs/strategy/2026-04-28-hir-master-blueprint.md` and the strategic-vision memory). Two apps make this impossible.
3. Multi-vendor isolation (partner fleets must never see HIR's couriers) is a solved problem — RLS at the DB level. Not a reason to split codebases.
4. White-label per fleet (brand color, logo, custom domain) is already shipped in `courier_fleets` (PR #25, on main).
5. One codebase = lower maintenance, faster iteration, fewer bugs.

---

## Architecture

```
                       ┌─────────────────────────────────────┐
                       │     Unified Courier App             │
                       │     apps/restaurant-courier/        │
                       │     (Next.js PWA → Supabase)        │
                       └────────────────┬────────────────────┘
                                        │
                  ┌─────────────────────┴──────────────────────┐
                  │                                            │
                  ▼                                            ▼
       ┌──────────────────────┐                  ┌──────────────────────┐
       │  Restaurant orders   │                  │   Pharma orders      │
       │  (canonical here)    │                  │   (canonical in Neon │
       │  Supabase Postgres   │                  │    via NestJS API)   │
       └──────────┬───────────┘                  └──────────┬───────────┘
                  │                                         │
                  ▼                                         ▼
        Supabase RLS + Realtime           Webhook → Supabase Edge Function →
        on courier_orders                 mirror row in courier_orders
                                          (vertical='pharma')
```

The courier app reads `courier_orders` from Supabase. Restaurant orders land there directly. Pharma orders are mirrored from Neon via webhook. The courier doesn't know or care where an order originated — they see a unified queue with a vertical badge.

---

## Schema additions (Phase A — to ship next)

In `hir-platform/supabase/migrations/`:

```sql
-- 1. Vertical on each order
alter type order_source add value if not exists 'PHARMA_MIRROR';
alter table courier_orders
  add column if not exists vertical text not null default 'restaurant'
    check (vertical in ('restaurant', 'pharma'));

-- 2. allowed_verticals on each fleet (controls routing)
alter table courier_fleets
  add column if not exists allowed_verticals text[] not null
    default array['restaurant', 'pharma'];

-- 3. tier on each fleet (owner / partner / external)
alter table courier_fleets
  add column if not exists tier text not null default 'partner'
    check (tier in ('owner', 'partner', 'external'));

-- 4. RLS policy: courier sees only orders matching their fleet AND
--    their fleet's allowed verticals
drop policy if exists courier_orders_courier_read on courier_orders;
create policy courier_orders_courier_read on courier_orders for select to authenticated
  using (
    fleet_id in (
      select cp.fleet_id from courier_profiles cp where cp.user_id = auth.uid()
    )
    and vertical = any (
      select unnest(cf.allowed_verticals) from courier_fleets cf
       where cf.id = courier_orders.fleet_id
    )
  );
```

---

## Phases + timeline

| Phase | Scope | Risk to TEI close | ETA |
|---|---|---|---|
| **A. Schema + RLS** | Migrations above + RLS + indexes | None (additive only) | 1-2 days |
| **B. Pharma → Supabase webhook sync** | NestJS emits webhook on order create/status; Edge Function inserts mirror row | Low (pharma DB stays canonical) | 1 week |
| **C. Pharma-aware UI in courier app** | Conditional render: prescription + ID upload, RX validation, pharmacist hand-off proof when `vertical='pharma'` | None (old pharma courier still active) | 1 week |
| **D. TEI courier migration to unified app** | Done weekend after TEI signs; old `hir-pharma-courier` Vercel project goes dark | Medium — monitored, reversible | 1-2 weeks AFTER TEI close |

Phases A, B, C run during TEI sales cycle without touching the live TEI flow. Phase D is post-TEI-close cleanup.

---

## Cross-project boundaries (do not cross without approval)

| You may freely change | You MUST coordinate before changing |
|---|---|
| Anything in `apps/restaurant-courier/` | `pharmacy-saas-phase1/prisma/schema.prisma` (TEI compliance) |
| Anything in `hir-platform/supabase/migrations/` (additive) | Any cron job in pharmacy-saas-phase1 |
| New Edge Functions in `hir-platform/supabase/functions/` | The Vercel `hir-pharma-courier` project before Phase D |
| RLS policies on `courier_*` tables (additive — broaden, never narrow) | Anything that would require a downtime window |

---

## Aggregator product (separate, future) — not coupled

When the consumer-facing aggregator product is built, it lives in its own codebase, its own Vercel project, its own brand. It reads PUBLIC tenant directory data (slug, name, cuisine, brand_color, address) — NEVER the `courier_*` tables. Strict boundary. Do not put aggregator code in this courier codebase.

---

## What this enables (the moat)

A single courier signs into ONE app and sees orders flowing in from pharmacies AND restaurants AND any other vertical we onboard later (florist? alcohol delivery? laundry?). They pick the next nearest, regardless of vertical. They earn from a unified earnings system. The fleet operator manages everything in one dashboard.

This is the "Wolt for any merchant" play — and it requires one codebase to scale beyond two verticals without exponential complexity.

---

## Naming convention going forward

- `apps/restaurant-courier/` (current path) → will be renamed `apps/courier/` once Phase D ships
- Vercel project to be created: `hir-courier-app` (production deploy of unified app)
- Vercel project `hir-pharma-courier` is **frozen** until Phase D, then deleted
- Database schema: keep `courier_*` table prefix (already in use)
- Internal terms: "Fleet" (not "subcontractor", not "partner fleet") — see `fleet_network_confidentiality.md`

---

## Status

- [x] Owner decision locked 2026-04-29
- [x] Memory file `courier_unification_decision_2026-04-29.md` written
- [x] MEMORY.md index updated
- [x] This strategy doc written + checked into repo
- [ ] Phase A migration drafted
- [ ] Phase A migration applied on prod Supabase
- [ ] Phase B webhook contract designed
- [ ] Phase C UI sketches done
- [ ] Phase D dry-run plan + TEI sign-off
