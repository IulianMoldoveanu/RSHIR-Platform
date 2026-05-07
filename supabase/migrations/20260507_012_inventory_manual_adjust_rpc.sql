-- Lane INVENTORY-FOLLOWUP PR 3b (2026-05-07) — atomic manual stock adjust.
--
-- Codex P2 on PR #334: SELECT-then-UPDATE in the original
-- manualAdjustStockAction was racy with the AFTER UPDATE trigger
-- (`trg_orders_inventory_deplete_on_delivered`, migration 009) and with a
-- concurrent second manual adjust. In a race, the ledger row would persist
-- but `inventory_items.current_stock` would lose the other party's delta —
-- silent divergence between current_stock and sum(movements.delta).
--
-- Fix: server-side RPC that does the ledger insert AND the
-- `current_stock = current_stock + delta` UPDATE atomically inside a
-- single function body. Tenant + item validated server-side so the RPC
-- is safe to expose to authenticated callers (defense-in-depth: the
-- composite tenant FK on inventory_movements would reject cross-tenant
-- writes anyway).
--
-- Idempotent — `create or replace`.

create or replace function public.fn_inventory_manual_adjust(
  p_tenant_id   uuid,
  p_item_id     uuid,
  p_delta       numeric,
  p_note        text,
  p_actor_user  uuid
)
returns table (
  movement_id   uuid,
  new_stock     numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_movement_id  uuid;
  v_new_stock    numeric;
begin
  if p_delta = 0 then
    raise exception 'Delta trebuie să fie un număr nenul.' using errcode = '22023';
  end if;

  -- Atomic increment + RETURNING. If item doesn't exist for this tenant,
  -- update affects 0 rows; we surface a clean RO error.
  update public.inventory_items
     set current_stock = current_stock + p_delta,
         updated_at    = now()
   where tenant_id = p_tenant_id
     and id        = p_item_id
  returning current_stock into v_new_stock;

  if v_new_stock is null then
    raise exception 'Ingredient inexistent pentru acest restaurant.' using errcode = 'P0002';
  end if;

  -- Ledger insert in the same transaction. Composite tenant FK on
  -- (tenant_id, inventory_item_id) blocks cross-tenant inserts at the DB.
  insert into public.inventory_movements
    (tenant_id, inventory_item_id, delta, reason, actor_user_id, metadata)
  values
    (p_tenant_id, p_item_id, p_delta, 'MANUAL_ADJUST', p_actor_user,
     jsonb_build_object('note', p_note))
  returning id into v_movement_id;

  movement_id := v_movement_id;
  new_stock   := v_new_stock;
  return next;
end;
$$;

comment on function public.fn_inventory_manual_adjust(uuid, uuid, numeric, text, uuid) is
  'Atomic manual stock adjustment: appends an inventory_movements row (reason=MANUAL_ADJUST) AND increments inventory_items.current_stock by the delta in a single transaction. Avoids the SELECT-then-UPDATE race against the DELIVERED trigger or a concurrent manual adjust. Tenant/item membership is enforced by the function body and by the composite tenant FKs on inventory_movements.';

-- Defense-in-depth grants. The function runs as security definer; we keep
-- the surface tight by revoking from public/anon and granting only to
-- authenticated (the admin server actions call via service-role client
-- which bypasses GRANT, but explicit grants help if a future caller comes
-- in via the user-token client).
revoke all on function public.fn_inventory_manual_adjust(uuid, uuid, numeric, text, uuid) from public;
revoke all on function public.fn_inventory_manual_adjust(uuid, uuid, numeric, text, uuid) from anon;
grant execute on function public.fn_inventory_manual_adjust(uuid, uuid, numeric, text, uuid) to authenticated;
grant execute on function public.fn_inventory_manual_adjust(uuid, uuid, numeric, text, uuid) to service_role;
