# State machine drift investigation — `restaurant_orders.status`

**Audit Owner flag (P0 #13)**: UI defines OrderStatus union `PENDING/CONFIRMED/PREPARING/READY/DISPATCHED/IN_DELIVERY/DELIVERED/CANCELLED` at `apps/restaurant-admin/src/app/dashboard/orders/status-machine.ts:4-12` while the courier-symbiosis memory file mentions `NEW/ACCEPTED/...`.

## Sources investigated

| Source | Path | Statuses produced/consumed |
|---|---|---|
| DB CHECK constraint | `supabase/migrations/20260425_000_initial.sql:142-143` | `PENDING,CONFIRMED,PREPARING,READY,DISPATCHED,IN_DELIVERY,DELIVERED,CANCELLED` (default `PENDING`) |
| UI type union (admin) | `apps/restaurant-admin/src/app/dashboard/orders/status-machine.ts:4-12` | same 8 values |
| Storefront insert (checkout intent) | `apps/restaurant-web/src/app/api/checkout/intent/route.ts:252,358` | inserts with `status: 'PENDING'` |
| Storefront payment-success update | `apps/restaurant-web/src/app/api/checkout/order-finalize.ts:41,74` | `'CONFIRMED'` |
| Voice agent confirm | `apps/restaurant-admin/src/app/dashboard/voice/actions.ts:61` | `'CONFIRMED'` |
| Aggregator-email parser | `apps/restaurant-admin/src/app/dashboard/settings/aggregator-intake/actions.ts:295` | `'CONFIRMED'` |
| Bidi-sync trigger (RSHIR → courier) | `supabase/migrations/20260526_002_restaurant_courier_bidi_sync.sql:42-95` | fires on `DISPATCHED` edge; mirrors `CANCELLED` |
| Bidi-sync trigger (courier → RSHIR reverse) | `supabase/migrations/20260526_002_restaurant_courier_bidi_sync.sql:119-157` | writes `IN_DELIVERY`, `DELIVERED`, `CANCELLED` back |

## Source of the "NEW/ACCEPTED" memory mention

Cross-checked the memory files referenced by the audit:

- `~/.claude/projects/.../memory/POST_2026-05-26_COURIER_SYMBIOSIS_FULL.md` line 39: `get_my_active_orders | comenzi assigned ACCEPTED/PICKED_UP/IN_TRANSIT`

That sentence describes **`courier_orders.status`**, which has its OWN enum defined at `supabase/migrations/20260428_001_courier_app_scaffold.sql:65-66`:

```
status text not null default 'CREATED'
  check (status in ('CREATED','OFFERED','ACCEPTED','PICKED_UP','IN_TRANSIT','DELIVERED','CANCELLED'))
```

`NEW` only shows up in the codebase on **`integration_events.status`** and on **`aggregator_orders.status`** (unrelated tables — see `apps/restaurant-admin/src/app/dashboard/settings/integrations/actions.ts:205,454`). Neither is `restaurant_orders`.

## Verdict

**FALSE ALARM**. There is no drift in the `restaurant_orders.status` enum.

- DB enum, UI consume union, and storefront/voice/admin write paths all agree on the same 8 values.
- The "NEW/ACCEPTED" wording in the memory file describes the sibling **`courier_orders.status`** state machine, not `restaurant_orders.status`. The audit conflated the two state machines because they live in the same conceptual domain.
- The bidi-sync trigger (`20260526_002`) explicitly maps between them: courier `PICKED_UP`/`IN_TRANSIT` → restaurant `IN_DELIVERY`, courier `DELIVERED` → restaurant `DELIVERED`. The mapping function is the only place where the two enums interact.

## Recommendation

No migration / no code change. Optional follow-up: rename audit P0 #13 to a documentation task — add a short comment block above `OrderStatus` in `status-machine.ts` clarifying that `courier_orders.status` is a separate enum, so the next reader does not repeat the conflation.
