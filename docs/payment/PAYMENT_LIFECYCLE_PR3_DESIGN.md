# Payment lifecycle — PR 3 (refund + cancel actions) — DESIGN

**Status**: DRAFT — held for Iulian sign-off before implementation lands.
**Predecessors**: PR #251 (schema), PR #254 (dispute/refund webhook intake).
**Risk**: HIGH — first money-movement code path in the platform.

This PR is intentionally empty of executable code. It exists so Iulian can
review the design + risk surface BEFORE we wire `stripe.refunds.create`
calls. Once approved, the implementation lands as commits on this branch.

---

## Scope

### 1) Admin "Rambursare" button — `/dashboard/orders/[id]`
- Visible to OWNER + MANAGER only (RLS-checked server action).
- Disabled when `payment_status != 'PAID'` or `refunded_at IS NOT NULL`.
- Confirmation modal: "Rambursare totală — `<sum>` RON. Acțiunea este
  ireversibilă." (RO formal "dumneavoastră" register).
- Optional reason picker: `requested_by_customer` / `duplicate` /
  `fraudulent` (matches Stripe's `Refund.reason` enum).
- Server action calls `stripe.refunds.create({ payment_intent, reason })`
  — full refund only in v1. Partial refund deferred (UI complexity vs
  pilot value not worth it pre-Brașov).
- On success: optimistic UI update; the `charge.refunded` webhook (PR 2)
  flips DB state authoritatively ~1-3s later.
- Audit log entry with `actor_user_id` populated (separate `action`
  string from PR 2's webhook-side `order.refund_observed` —
  `order.refund_initiated` for the admin action).

### 2) Customer "Anulează comanda" button — `/track/[token]`
- Visible only when `status IN ('PENDING','CONFIRMED')` AND
  `payment_status = 'PAID'` AND order is <= 5 minutes old.
  After the 5-min window or once status flips to PREPARING, the button
  hides — the kitchen has likely started, manual intervention required
  via support chat.
- Confirmation: "Sunteți sigur(ă) că doriți să anulați comanda? Veți
  primi rambursarea pe cardul folosit în 5-10 zile lucrătoare."
- Server action: validates token, validates window, sets
  `cancelled_at` + `cancellation_reason='customer_self_cancel'`,
  flips `status='CANCELLED'`, calls `stripe.refunds.create` for full
  amount with `reason='requested_by_customer'`.
- Idempotency: re-clicking the button after success is a no-op
  (status check at top of action).

### 3) Admin manual cancel — `/dashboard/orders/[id]`
- Same conditions as customer cancel BUT no time window (operator
  override) AND requires explicit reason picker:
  `out_of_stock` / `kitchen_overload` / `customer_request` / `other`.
- Sets `cancelled_at` + `cancellation_reason`, flips `status='CANCELLED'`.
- If `payment_status='PAID'`, calls `stripe.refunds.create` automatically.
- If `payment_status='UNPAID'` (COD), no refund call; just status flip.

### 4) Email notifications
- Refund completed → customer receives "Rambursarea dumneavoastră a fost
  inițiată — `<sum>` RON pe cardul `**** <last4>`. Procesarea durează
  5-10 zile lucrătoare." (template `order.refunded`).
- Cancellation → customer receives "Comanda dumneavoastră a fost anulată"
  + reason if customer-facing (template `order.cancelled`).
- Triggered from the existing email pipeline (audit on `audit_log` insert
  via Edge Function trigger, same pattern as `notify-customer-status`).

### 5) Courier dispatch revocation — open question (NOT in PR 3 scope)
When admin cancels a CONFIRMED order, the courier may already be holding
a `hir_delivery_id`. Cancelling the courier dispatch needs a new endpoint
on `delivery-client` (currently only `createOrder`). **Recommendation**:
ship PR 3 WITHOUT courier revocation (admin manually radios the courier
in v1; Brașov has 3 restaurants and 2-3 couriers). Cancel-revoke flow
lands in a follow-up PR after the `delivery-client.cancelOrder` contract
is agreed with `pharma-coordinator` (shared package).

---

## Risk surface

1. **Double refund** — admin clicks twice, OR admin refunds while
   `charge.refunded` webhook from a Stripe-dashboard-initiated refund is
   in flight. Mitigation:
   - Server action reads `payment_status` + `refunded_at` BEFORE calling
     Stripe; rejects if either has changed.
   - Stripe's `Refund.create` is idempotent given the same idempotency
     key — we'll pass `idempotency_key=`order.id`-refund` so retries are
     safe.

2. **Cancel race with kitchen** — customer clicks cancel at second 4:59
   while the kitchen flips status to PREPARING at second 5:00. Mitigation:
   server action's `update ... where status IN ('PENDING','CONFIRMED')`
   is the atomic guard — if the kitchen claimed the row first, the
   customer's update affects 0 rows and the action returns "prea târziu".

3. **Refund without payment_intent** — older orders may have NULL
   `stripe_payment_intent_id` (pre-Stripe migrations or COD). Mitigation:
   button hides when `payment_status != 'PAID'`. Edge case where PI is
   missing on a PAID row should never happen but server action validates
   anyway.

4. **Audit log NOT NULL on tenant_id** — already enforced; admin actions
   always have tenant context.

5. **Email failure** — best-effort, doesn't block refund. Customer can
   always check Stripe statement. Email retry handled by existing email
   queue (TODO: confirm whether `notify-customer-status` retries on
   failure — if not, add a simple Edge Function retry loop).

---

## Implementation plan (post sign-off)

1. Server actions in `apps/restaurant-admin/src/app/dashboard/orders/[id]/actions.ts`:
   `refundOrder`, `cancelOrder`. ~120 LOC each, includes RLS check via
   tenant_member capability.
2. Server action in `apps/restaurant-web/src/app/track/[token]/actions.ts`:
   `customerCancelOrder`. ~60 LOC.
3. Stripe helper: `apps/restaurant-web/src/lib/stripe/refund.ts` — single
   `refundPaymentIntent(intentId, reason, idempotencyKey)` wrapper.
4. UI components: confirmation modals + button states.
5. Email templates: extend `order_emails` with `refunded` + `cancelled`
   variants.
6. Tests: vitest for server actions (mock Stripe, assert idempotency
   key + audit log entry), 1 e2e Playwright for happy-path admin refund.

Estimate after sign-off: 1-1.5 dev-days for me, including review loop.

---

## Why this PR is empty

Per `BEAST_MODE` charter + payment-lifecycle lane spec, "Refund + cancel
actions ... Iulian reviews + approves before merge." Building first and
asking for review later means we either ship money-movement code without
sign-off (charter violation) or rip out a working PR if the design is
wrong. Empty PR = cheap design review.

Once Iulian comments **APPROVED** on this PR, I push the implementation
in commits and remove the `do-not-merge` label.
