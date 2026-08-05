-- Fixes a race condition found in a security audit of the checkout flow
-- ahead of Delivery House's high-volume launch: checkIdempotency() only
-- SELECTs to detect a replay; the row is written by storeIdempotency()
-- only at the very END of the request handler, after the order + PSP
-- session are already created. Two concurrent POSTs with the same
-- Idempotency-Key (aggressive client retry on a flaky mobile connection,
-- or a double-tap) both pass the initial "not found" check and each
-- create their own order/payment — the primary key on
-- (tenant_id, idempotency_key, request_hash) doesn't help because both
-- requests have the identical hash and neither has written yet when the
-- other checks.
--
-- Fix: a separate unique index on (tenant_id, idempotency_key) alone
-- (dropping request_hash from the uniqueness check) lets the route
-- acquire an early lock via `INSERT ... ON CONFLICT DO NOTHING` the
-- moment it sees a fresh key — before any order/PSP work — so the loser
-- of the race gets a clean "try again" instead of creating a duplicate
-- order. response/status_code become nullable so the lock row can exist
-- before the real response is known; the route fills them in via UPDATE
-- once the request completes (mirrors storeIdempotency's existing write,
-- now an UPDATE instead of a first INSERT).

alter table public.idempotency_keys
  alter column response drop not null,
  alter column status_code drop not null;

create unique index if not exists idempotency_keys_tenant_key_unique
  on public.idempotency_keys (tenant_id, idempotency_key);
