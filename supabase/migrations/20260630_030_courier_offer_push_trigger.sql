-- Directed-offer push: AFTER UPDATE trigger on courier_orders that fires an
-- OS push to the ONE courier a directed offer was assigned to.
--
-- Problem this solves
-- -------------------
-- The only push trigger on courier_orders is AFTER INSERT
-- (20260629_001 → fleet-wide "new order available"). The directed-dispatch
-- path (the "Atribuie"/BUTON ALOCARE flow) moves an EXISTING CREATED row to
-- OFFERED via the offer_courier_order RPC (20260630_002) — an UPDATE, not an
-- INSERT — so nothing pushed. A courier who is the specific target of a
-- directed offer, with the app backgrounded / screen-off, received NO
-- notification; the offer then silently expired (revoke cron, 20260630_001)
-- and bounced back to CREATED. (31-agent readiness review, P1.)
--
-- Design
-- ------
-- * Fires only on the actual transition INTO OFFERED with an assigned courier
--   (status changed AND status='OFFERED' AND assigned_courier_user_id NOT NULL),
--   so an ordinary update to an already-OFFERED row does not re-push.
-- * TARGETED: passes target_user_id so courier-push-dispatch notifies that one
--   courier, NOT the whole fleet (a directed offer is not claimable by peers).
-- * Does NOT touch courier_push_dispatched_at — that idempotency column is for
--   the create-time fleet push and is already consumed by it; the edge fn skips
--   the claim when target_user_id is present. The trigger's transition guard is
--   the dedupe (re-offers after a revoke legitimately push again).
-- * Reuses the same vault secrets as the INSERT trigger (URL + service-role
--   JWT) so config rotates without a migration. Missing config → silent no-op.

create or replace function public.dispatch_courier_push_on_offer()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url  text;
  v_auth text;
begin
  -- Only the directed CREATED→OFFERED transition, to a specific courier.
  if new.fleet_id is null or new.assigned_courier_user_id is null then
    return new;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'courier_push_dispatch_url' limit 1;
  select decrypted_secret into v_auth
    from vault.decrypted_secrets where name = 'courier_push_dispatch_auth' limit 1;
  if v_url is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || coalesce(v_auth, '')
    ),
    body    := jsonb_build_object(
      'fleet_id',       new.fleet_id,
      'order_id',       new.id,
      'target_user_id', new.assigned_courier_user_id,
      'title',          'HIR Curier — Comandă pentru tine',
      'body',           'Ai primit o comandă. Glisează pentru a accepta.',
      'urgent',         true
    )
  );

  return new;
end;
$$;

comment on function public.dispatch_courier_push_on_offer is
  'AFTER UPDATE trigger on courier_orders. Fires a TARGETED courier-push-dispatch '
  '(target_user_id = the assigned courier) via pg_net the instant an order '
  'transitions to OFFERED through the directed-dispatch path, so a backgrounded '
  'target courier gets an OS notification instead of silently missing the offer. '
  'Reuses the INSERT trigger''s vault secrets; silent no-op if unconfigured.';

drop trigger if exists trg_courier_orders_push_offer on public.courier_orders;
create trigger trg_courier_orders_push_offer
  after update of status on public.courier_orders
  for each row
  when (
    new.status = 'OFFERED'
    and new.status is distinct from old.status
    and new.assigned_courier_user_id is not null
  )
  execute function public.dispatch_courier_push_on_offer();
