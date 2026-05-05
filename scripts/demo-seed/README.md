# Demo Seed — FOISORUL A

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
