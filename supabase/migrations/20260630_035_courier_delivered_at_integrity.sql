-- 20260630_035_courier_delivered_at_integrity.sql
-- ⚠️ REVIEW-READY — apply to prod via the Supabase Management API AFTER staging.
-- Merging this file does NOT auto-apply it (this repo applies migrations manually).
--
-- Audit board CRITICAL (HIR-ECOSYSTEM-AUDIT-2026-06-18): a DELIVERED courier_order
-- with a NULL delivered_at silently vanishes from the payout loop.
-- fn_generate_courier_payout_periods (20260630_031:158-160) filters
--   status = 'DELIVERED' AND delivered_at >= p_period_start AND delivered_at < p_period_end
-- and a NULL delivered_at makes both comparisons evaluate to NULL (= false), so the
-- row is excluded with no audit trail → the courier is never paid for that delivery.
-- The BEFORE trigger coalesces delivered_at on the normal path, but any
-- trigger-bypassing UPDATE (admin console / migration / legacy path) can still
-- reach this state. Enforce the invariant at the table level.
--
-- Idempotent: safe to re-run.

begin;

-- 1. Backfill existing DELIVERED rows missing delivered_at.
--    Best available timestamp: delivered_at -> updated_at -> now().
update public.courier_orders
   set delivered_at = coalesce(delivered_at, updated_at, now())
 where status = 'DELIVERED'
   and delivered_at is null;

-- 2. Add the invariant as NOT VALID first (fast — only a catalog change, no
--    full-table scan, brief ACCESS EXCLUSIVE), guarded for idempotency.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'courier_orders_delivered_at_required'
       and conrelid = 'public.courier_orders'::regclass
  ) then
    alter table public.courier_orders
      add constraint courier_orders_delivered_at_required
      check (status <> 'DELIVERED' or delivered_at is not null) not valid;
  end if;
end $$;

-- 3. Validate it (SHARE UPDATE EXCLUSIVE — does not block reads/writes).
--    No-op if already validated. After step 1 every DELIVERED row qualifies.
alter table public.courier_orders
  validate constraint courier_orders_delivered_at_required;

commit;

-- Belt-and-braces (optional, NOT included here to avoid re-emitting the whole
-- payout function): a future CREATE OR REPLACE of fn_generate_courier_payout_periods
-- may add `and co.delivered_at is not null` to its WHERE. Redundant once the CHECK
-- above holds, so left as a documented follow-up.
