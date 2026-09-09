-- ============================================================================
-- The re-offer push that silenced itself.
--
-- Codex P2 on #1075, and it is right — measured, it is worse than described.
--
-- revoke_expired_courier_offers stamped `courier_push_dispatched_at = now()`
-- and THEN posted to courier-push-dispatch with no `target_user_id`. A
-- non-directed request goes through the edge function's idempotency claim
-- (`UPDATE ... WHERE courier_push_dispatched_at IS NULL`,
-- courier-push-dispatch/index.ts:156-173), which now finds the stamp this
-- function just wrote, and returns `{ ok: true, sent: 0, note:
-- 'already_dispatched' }`. Every re-offer broadcast since it was written has
-- notified nobody. The function consumed the claim its own HTTP call depended
-- on.
--
-- It is removed rather than repaired, for three reasons:
--
--   1. THE COURIER WHO GETS THE RE-OFFER IS ALREADY TOLD. When the next sweep
--      moves the order CREATED -> OFFERED, trg_courier_orders_push_offer fires
--      dispatch_courier_push_on_offer with `target_user_id`, and a DIRECTED
--      push deliberately skips the claim. That path works and is untouched.
--
--   2. A FLEET-WIDE "COME AND GRAB IT" HAS NOTHING BEHIND IT. Pull/self-pickup
--      dispatch was eliminated on 2026-08-04 — dispatch is push or a human
--      dispatcher, never a scramble. A broadcast to couriers who were offered
--      nothing is a notification with no action attached. The `urgent` and
--      `reoffer` flags in the body confirm the drift: the edge function
--      declares `urgent` in its type and reads neither.
--
--   3. IT WROTE ON ORDERS IT HAD NOTHING TO DO WITH. The loop selected every
--      CREATED order touched in the last 10 seconds, not the ones this call
--      revoked, and stamped `courier_push_dispatched_at` on all of them —
--      burning the idempotency claim of orders that had just arrived.
--
-- What remains is what the function is for: return the lapsed offer to the
-- pool, and record who let it lapse.
--
-- Noted, deliberately NOT touched: public.dispatch_courier_push_on_new_order
-- still exists with no trigger bound to it — verified against pg_trigger, the
-- only push trigger on courier_orders is the directed one above. So an order
-- entering the pool raises no notification at all today, which is the correct
-- behaviour under push-only dispatch. Removing the orphan function is someone
-- else's decision, not this migration's.
-- ============================================================================

create or replace function public.revoke_expired_courier_offers()
returns integer
language plpgsql
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
  v_count integer;
begin
  with expiring as (
    select id, assigned_courier_user_id
      from public.courier_orders
     where status = 'OFFERED'
       and offer_expires_at is not null
       and offer_expires_at < now()
  ), revoked as (
    update public.courier_orders co
       set status = 'CREATED',
           assigned_courier_user_id = null,
           offer_expires_at = null,
           updated_at = now()
      from expiring e
     where co.id = e.id
       and co.status = 'OFFERED'
    -- The courier has to come from `e`: co.assigned_courier_user_id is null by
    -- the time RETURNING reads it.
    returning co.id, e.assigned_courier_user_id as courier_user_id
  ), noted as (
    -- Codex P2 (#1075): only orders this statement actually revoked. An order
    -- accepted between the snapshot and the lock is skipped above, and must not
    -- leave a decline behind saying its courier ignored it.
    insert into public.courier_order_offer_declines (courier_order_id, courier_user_id, expired_at)
    select r.id, r.courier_user_id, now()
      from revoked r
     where r.courier_user_id is not null
    on conflict (courier_order_id, courier_user_id)
      do update set expired_at = excluded.expired_at
    returning 1
  )
  select count(*) into v_count from revoked;

  return v_count;
end;
$function$;

comment on function public.revoke_expired_courier_offers() is
  'Returns lapsed offers to the pool and records who let them lapse. Sends no '
  'notification: the courier who receives the next offer is pushed by '
  'trg_courier_orders_push_offer, and a fleet-wide broadcast has had no '
  'meaning since pull dispatch was removed on 2026-08-04.';
