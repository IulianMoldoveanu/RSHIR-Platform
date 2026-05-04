-- Lane G — Stripe webhook idempotency.
--
-- Stripe retries webhooks aggressively (up to 3 days, with exponential backoff)
-- when our handler is slow or returns a non-2xx. Without dedup, a single
-- payment_intent.succeeded retried 5 times will:
--   * race the (already-idempotent) markOrderPaidAndDispatch happy path 5x
--   * dispatch 5 courier-side handoffs (markOrderPaidAndDispatch's atomic
--     payment_status guard catches duplicates *only after* the second update
--     hits the row — under sufficient concurrency the courier client may
--     still see a brief double-call window)
--   * emit 5 audit/integration-bus events
--
-- Stripe events have a stable unique id (`evt_*`). We persist the id on first
-- successful processing and short-circuit any retry. 30-day retention is
-- generous (Stripe stops retrying at 3 days) and tiny in storage cost (~1 KB
-- per event * 1000 events/day = 30 MB/month upper bound).

create table if not exists public.stripe_events_processed (
  id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

-- Cleanup helper: a periodic pg_cron job (or one-off Mgmt API call) can drop
-- rows older than 30 days. Not auto-scheduled here to keep migration additive.
create index if not exists stripe_events_processed_processed_at_idx
  on public.stripe_events_processed (processed_at);

-- Defensive: the storefront's checkout/intent route already sets
-- stripe_payment_intent_id on a fresh PaymentIntent, but a webhook retrying
-- on a deleted+recreated row (or future PaymentIntent reuse via
-- /confirm-payment) could land twice. UNIQUE forces detection at write time
-- instead of silently linking the same intent to multiple orders.
--
-- WHERE clause: legacy COD/PENDING orders never get an intent set, so we
-- need a partial index to allow many NULLs.
create unique index if not exists restaurant_orders_stripe_payment_intent_id_uidx
  on public.restaurant_orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- RLS: service-role only. The webhook handler runs server-side with the
-- service-role key; nothing in the client/admin/courier apps reads from
-- this table. Default-deny via no policy + RLS enabled.
alter table public.stripe_events_processed enable row level security;
