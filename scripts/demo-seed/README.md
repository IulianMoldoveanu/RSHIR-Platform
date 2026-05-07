# Demo Seed

This directory contains two complementary seeding tools:

1. **FOISORUL A** (real tenant pre-existing on prod) — populates `/dashboard`
   and `/fleet` for that one slug with 30 days of activity. Files:
   `seed-foisorul-a.mjs`, `cleanup-foisorul-a.mjs`. See [FOISORUL A](#foisorul-a) below.
2. **Segment sandbox tenants** (4 brand-new `demo-*` tenants) — one per
   restaurant segment for sales demos. Tenants are created if missing,
   populated, and cleanly removable. See [Segment demos](#segment-demos) below.

The two paths never collide: the segment scripts hard-refuse to operate on the
slug `foisorul-a`, and the FOISORUL A scripts hard-refuse to operate on any
slug other than `foisorul-a`.

---

## Segment demos

Four sandbox tenants designed for the București sales tour 2026-05-12+.
Each represents a defendable Romanian restaurant segment per
`HIR-Realistic-Volume-Model-2026-05-08.md`:

| Script | Tenant slug | City | Ord/day | AOV (RON) | Couriers | Reservations | Pre-orders |
|---|---|---|---|---|---|---|---|
| `pizzerie-mica.mjs` | `demo-pizzerie-mica` | Brașov | 25 | 65 | 1 | – | – |
| `fast-food-activ.mjs` | `demo-fast-food-activ` | București | 100 | 40 | 3 | – | – |
| `restaurant-familial.mjs` | `demo-restaurant-familial` | Brașov | 30 | 90 | 2 | yes | – |
| `cofetarie.mjs` | `demo-cofetarie` | Cluj | 20 | 70 | 0 | – | 60% |

### What each demo shows

- **Pizzerie mică** — typical "vecin de cartier" with 1 active courier,
  Brașov 5 km zone, 15-item menu. Anti-Glovo pitch: pizza chain at 30%
  commission vs HIR at 1+1 RON.
- **Fast-food activ** — high-volume shaorma operator (București, 100 ord/day,
  3 couriers, 30-item menu). Anti-aggregator pitch: 3 RON/livrare HIR vs
  ~17-25 RON/livrare via Bolt/Glovo at AOV 40 RON.
- **Restaurant familial** — classic full-service restaurant (60-item menu,
  reservations enabled, mid AOV 90 RON, 2 couriers). Pitch: HIR is one tool
  for delivery + table reservations + KDS, no Wolt/Glovo.
- **Cofetărie** — patiserie with 60% pre-orders (torturi, evenimente),
  no own couriers — uses HIR Direct on demand. Cluj-zoned. Pitch: cofetărie
  surface for pre-orders + checkout cu plată, fără comision per livrare la
  ridicarea în magazin.

### Run all 4

```sh
node scripts/demo-seed/seed-all-segments.mjs
```

This invokes the 4 scripts sequentially. Idempotent — re-running is safe.

### Run one segment

```sh
node scripts/demo-seed/pizzerie-mica.mjs
node scripts/demo-seed/fast-food-activ.mjs
node scripts/demo-seed/restaurant-familial.mjs
node scripts/demo-seed/cofetarie.mjs
```

Common flags:

- `--dry-run` — print SQL only, no DB writes
- `--reset` — wipe the segment tenant first (FK-safe), then reseed
- `--allow-prod` — required when `HIR_ENV=production` (defensive double-check)

### Cleanup

Remove all 4 demo tenants + their data (real tenants untouched):

```sh
node scripts/demo-seed/cleanup-all-segments.mjs --dry-run   # preview
node scripts/demo-seed/cleanup-all-segments.mjs             # actual
```

The cleanup matches by `slug LIKE 'demo-%'` AND `settings ->> 'demo_seed' = true` —
both must be true, defensive against accidentally cleaning a real tenant.

### After seeding — what to expect

Per segment demo:

- **Admin orders list** populated with 30 days of orders, mix of statuses,
  realistic peak hours (lunch 12-14, dinner 19-22, weekend +30%).
- **Dashboard KPIs** — 30-day revenue, AOV, orders/day chart match the
  segment's defendable numbers.
- **Reviews** ~20% of delivered: 60% positive 4-5 stars, 30% neutral 3 stars,
  10% negative 1-2 stars (gives demo-able "how to respond to criticism" UX).
- **Courier app** — for segments with couriers (3 of 4), each courier has
  ~20 historical shifts + courier_orders aligned with restaurant_orders.
- **Inventory** — not pre-populated (different feature, not in this lane).

### Limitations

- These scripts **DO NOT** create OWNER auth.users for the demo tenants.
  To log in as one of the demo tenants, an OWNER must be added manually
  (`tenant_members` row with `role='OWNER'` linked to your existing auth.user).
  This is intentional — keeps demo seeds non-destructive of auth state.
- Couriers are inserted into `auth.users` with bcrypt-hashed dummy passwords;
  they cannot log in (by design — they're for showing data on the courier
  view, not for end-to-end app testing).
- Pre-order items in cofetărie are tagged via `notes` only; the tenant's
  `settings.preorder_enabled` flag is **not** set automatically (different
  feature, separate UI flow).

### Safety guardrails (built-in)

- Refuses to run if tenant slug is `foisorul-a` (real tenant).
- Refuses to run if `HIR_ENV=production` without `--allow-prod`.
- Every demo tenant slug **must** start with `demo-` (validated at script
  start; non-conforming slug aborts with exit code 2).
- Every demo customer email matches `%@hir-demo.ro`; every demo courier phone
  starts with `+4070099`; every demo order has `[DEMO_SEED]` notes prefix —
  cleanup uses these markers exclusively.
- The cleanup script double-checks `settings ->> 'demo_seed' = true` before
  deleting any tenant row.

### Required env / secrets

Same as FOISORUL A (read first from env, then `~/.hir/secrets.json`):

- `SUPABASE_PROJECT_REF`
- `SUPABASE_MANAGEMENT_PAT` (or `SUPABASE_ACCESS_TOKEN`)

---

<a name="foisorul-a"></a>
## FOISORUL A

Idempotent seed + cleanup for the FOISORUL A demo tenant (`slug=foisorul-a`).
Used to populate `/dashboard` and `/fleet` with realistic-looking 30-day
activity for the București pitch tour.

**Touches only the FOISORUL A tenant. No other tenant is ever written to.**

## What gets seeded

| Table | Volume | Marker |
| --- | --- | --- |
| `public.customers` | ~250 | `email LIKE '%@hir-demo.ro'` |
| `public.customer_addresses` | ~250 | linked to demo customers |
| `public.restaurant_orders` | ~700 (30d) | `notes LIKE '[DEMO_SEED]%'` |
| `public.restaurant_reviews` | ~140 | linked to demo orders |
| `auth.users` (demo couriers) | 4 | `email LIKE '%@hir-demo.ro'` |
| `public.courier_profiles` | 4 | `phone LIKE '+4070099%'` |
| `public.courier_shifts` | ~80 | linked to demo couriers |
| `public.courier_orders` | ~520 | `source_order_id LIKE 'DEMO-SEED-%'` |
| `public.affiliate_applications` | 4 (PENDING) | `email LIKE '%@hir-demo.ro'` |

Distributions:

- Lunch peak 12-14 (35%), dinner peak 19-22 (40%), other 25%.
- Weekend orders ~2× weekday volume.
- Customer growth curve: 60% of customers first appear in the last 10 days.
- Returning customer rate: ~60%.
- Order status (last 24h): mostly DELIVERED, a few IN_DELIVERY / PENDING / CANCELLED.
- Payment mix: 65% COD, 35% CARD (online).
- Average ticket: 55-85 RON, weighted toward grilled meat (FOISORUL A's signature).
- Reviews: ~20% of DELIVERED, mostly 4-5 stars (10% in 3-star range with constructive feedback).

## Safety rails

- **No notification side-effects.** Orders are inserted with their final
  `payment_status` and `status`. The `notify-new-order` and
  `notify-customer-status` triggers fire on `UPDATE`, never `INSERT`, so they
  stay quiet. `review_reminder_sent_at` is set to the order's `created_at` so
  the hourly review-reminder cron also skips demo orders.
- **Obviously-fake PII.** Phones are `+40700000NNN` (customers) or
  `+4070099NN` (couriers); emails use `@hir-demo.ro`. Even if a notification
  somehow fires, no real human gets pinged.
- **Idempotent.** Running `seed` twice is safe. The script reads the current
  demo volume and no-ops if the tenant is already at target. `cleanup` always
  starts from BEFORE counts → 0.
- **Deterministic.** Seeded with `mulberry32(20260505)` so the same input
  produces the same numbers each run.

## Required env / secrets

Loaded from env first, then `~/.hir/secrets.json` as fallback:

- `SUPABASE_PROJECT_REF` — project ref (e.g. `qfmeojeipncuxeltnvab`)
- `SUPABASE_MANAGEMENT_PAT` (or `SUPABASE_ACCESS_TOKEN`) — Mgmt API personal
  access token. Required for the SQL endpoint.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are read but currently unused
(reserved for a possible future PostgREST-based runner).

## Usage

### Dry run (prints SQL, makes no changes)

```sh
node scripts/demo-seed/seed-foisorul-a.mjs --dry-run
```

### Seed (idempotent)

```sh
node scripts/demo-seed/seed-foisorul-a.mjs
```

Expected output (first run):

```
[seed-foisorul-a] target project ref: qfmeojeipncuxeltnvab
[seed-foisorul-a] tenant: FOISORUL A (foisorul-a) abe949c6-... status=ACTIVE
[seed-foisorul-a] current demo state: customers=0 orders=0 menu_items=146 zones=2 affiliate_apps=0
[seed-foisorul-a] menu sample: ~50 food items in pool
[seed-foisorul-a] order plan: ~700 orders across 30 days
[seed-foisorul-a] generated: customers=250 orders=700 reviews=~140 shifts=~80 courier_orders=~520
[seed-foisorul-a] couriers seeded (4)
[seed-foisorul-a] customers + addresses seeded (250)
[seed-foisorul-a]   orders 100/700
...
[seed-foisorul-a] === SEEDING COMPLETE ===
  customers:         250
  orders:            700  (~640 delivered)
  revenue (RON):     ~50000
  reviews:           ~140
  courier shifts:    ~80
  courier orders:    ~520
  affiliate apps:    4
```

### Reset + reseed (wipe demo data first)

```sh
node scripts/demo-seed/seed-foisorul-a.mjs --reset
```

### Cleanup (remove only demo-tagged rows)

```sh
node scripts/demo-seed/cleanup-foisorul-a.mjs --dry-run   # preview
node scripts/demo-seed/cleanup-foisorul-a.mjs             # actual
```

## Run history

- 2026-05-05 — initial run vs prod (project `qfmeojeipncuxeltnvab`) before
  București pitch tour. See git history of this directory for confirmation.
