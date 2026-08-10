# Bucharest multi-vendor load test

Answers one question: **does the RSHIR ↔ HIR Curier flow hold up with many
vendors, many couriers and many simultaneous orders?**

Built 2026-08-10 because the platform had **12 orders in its entire history** and
had never been driven under load. Re-run it before onboarding a wave of vendors.

## It never runs against production

`lt-lib.mjs` hard-refuses the production project ref. Everything runs on an
isolated Supabase branch, so there are no real push notifications to couriers,
no emails, no payment intents and no data left in prod.

```bash
# 1. create a branch (Pro plan feature)
curl -X POST -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"branch_name":"loadtest-bucuresti","region":"eu-central-1"}' \
  https://api.supabase.com/v1/projects/<PROD_REF>/branches

# 2. the branch comes up EMPTY — Supabase does not apply this repo's
#    migrations, because they are applied by hand. Replay them in filename
#    order against the branch ref before seeding. Expect ~19 of 317 to fail on
#    "already exists"; that is fine, the objects are there.

# 3. run
export REF=<branch_ref>
node scripts/load-test/lt-seed.mjs     # 20 vendors, 5 fleets, 50 couriers
node scripts/load-test/lt-wave1.mjs    # full circuit, correctness
node scripts/load-test/lt-wave2.mjs    # contention, caps, RLS isolation
node scripts/load-test/lt-wave3.mjs    # simulated dinner rush
node scripts/load-test/lt-verify.mjs   # the two fixes still hold
```

`lt-seed.mjs` is re-runnable — it purges its own data first, including the
`delivery_pricings` / `fleet_invoice_items` / `payout_items` rows that are
`ON DELETE RESTRICT` against `courier_orders`.

## What the 2026-08-10 run established

Held up under 20 vendors / 50 couriers / up to 1670 concurrent open orders:

| | |
|---|---|
| atomic offer claim | 12 couriers raced for one order → exactly 1 winner |
| double-accept | 2 simultaneous accepts → exactly 1 landed |
| `max_parallel_orders` | never exceeded |
| cross-fleet assignment | none |
| RLS | anon and a non-member authenticated user both saw 0 rows |
| open-pool scan | `courier_orders_open_pool_idx`, 0.6 ms at 1670 orders |
| full sweep | ~1.5 s once a minute — comfortable headroom |

Two things it found, both fixed in `20260810_002`:

1. **A vendor with no fleet assignment produced undeliverable orders, silently.**
   The `PREPARING` trigger fell back to the first active `tier='owner'` fleet
   without checking it had any riders. The order was cooked, marked ready, and
   never offered to anyone.

2. **When the pool cannot drain, nothing said so.** The rush froze at 170 waiting
   orders from tick 6 on — every courier at their 3-order cap — with the sweep
   returning 0 offers a minute and no signal anywhere.

## The capacity number

**Concurrent orders in flight = couriers × `max_parallel_orders`.**

50 couriers at 3 each held 150; the remaining 170 of a 320-order rush waited for
deliveries to finish. That is correct behaviour, not a bug — but it means
courier headcount, not the database, is the ceiling. Size a Bucharest launch
from peak concurrent orders ÷ 3, and watch `pool_no_candidates` in
`courier.healthMonitor` for saturation.
