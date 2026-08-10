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

Confirmed exactly: with 50 couriers capped at 3, a 320-order rush parked
`accepted + picked_up = 150` and left the other **170 waiting**, tick after
tick, with the sweep offering 0. Courier headcount — not the database — is the
ceiling. Size a Bucharest launch from peak concurrent orders ÷ 3 and watch
`pool_no_candidates` in `courier.healthMonitor` for saturation.

### What this run does NOT tell you

**Drain rate.** `lt-wave3.mjs` advances time by backdating timestamps, which is
enough to reach saturation but not enough to complete a delivery cycle — across
20 ticks, `delivered` stayed 0, so orders never freed their courier. The
throughput figure that actually matters for a launch —
`couriers × cap ÷ average delivery minutes` — has to be measured against real
delivery times, not inferred from here. Treat the freeze as proof that the
ceiling exists and is now alarmed, not as a drain-time estimate.

**Sweep duration is not perfectly flat.** Median ~0.9 s, but one tick hit
**4.8 s**. Still far inside the 60-second cadence, and the pool scan itself is
0.6 ms — the cost is the per-order candidate subquery — but it is worth
re-checking if the courier count grows well beyond 50.
