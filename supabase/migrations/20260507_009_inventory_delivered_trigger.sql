-- Lane INVENTORY-V1 PR 3a (2026-05-07) — DELIVERED stock-deplete trigger.
--
-- When a restaurant_order transitions to status = 'DELIVERED', iterate its
-- items[], look up matching menu_item_recipes for the tenant, and:
--   1. Decrement inventory_items.current_stock by (item.qty *
--      recipe.qty_per_serving) for each matched recipe row.
--   2. Append an inventory_movements ledger row with reason
--      'ORDER_DELIVERED' and the order_id.
--
-- Hard guarantees:
--   - EXCEPTION-WHEN-OTHERS wrap: any failure logs and returns NEW so the
--     order flow never crashes due to inventory accounting.
--   - Only fires when (OLD.status IS DISTINCT FROM 'DELIVERED' AND
--     NEW.status = 'DELIVERED'). Idempotent against re-saves.
--   - No-op when feature_flags.inventory_enabled is falsy for the tenant.
--   - No-op when the tenant has zero recipes (the typical case for tenants
--     not using inventory).
--
-- The composite tenant FKs from migration 20260507_006 + 007 + 008 ensure
-- recipes always reference parent rows in the same tenant, so we never
-- decrement the wrong tenant's stock.
--
-- Idempotent: every CREATE/ALTER uses IF NOT EXISTS / OR REPLACE.

-- ============================================================
-- 1. Trigger function
-- ============================================================
create or replace function public.inventory_deplete_on_delivered()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_flags        jsonb;
  v_enabled      boolean := false;
  v_item         jsonb;
  v_menu_item_id uuid;
  v_qty          numeric;
  v_recipe       record;
  v_delta        numeric;
begin
  -- Only act on transition INTO 'DELIVERED'.
  if NEW.status is distinct from 'DELIVERED' then
    return NEW;
  end if;
  if OLD.status is not distinct from 'DELIVERED' then
    return NEW;
  end if;

  -- Feature flag gate: skip tenants that haven't opted in.
  select feature_flags into v_flags
    from public.tenants
   where id = NEW.tenant_id;
  if v_flags is null then
    return NEW;
  end if;
  v_enabled := coalesce(
    (v_flags->>'inventory_enabled')::boolean,
    false
  );
  if not v_enabled then
    return NEW;
  end if;

  -- Iterate items[]. Items shape: [{id: menu_item_uuid, qty: N, ...}]
  if NEW.items is null or jsonb_typeof(NEW.items) <> 'array' then
    return NEW;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) loop
    -- Defensive parsing. The line-item shape varies by code path:
    --   - Primary checkout (apps/restaurant-web .../checkout/intent/route.ts
    --     line 241) persists `q.lineItems` shape: {itemId, quantity, ...}.
    --   - Older / aggregator-import / seed paths use {id, qty, ...}.
    -- Support both, mirroring the coalesce pattern established in
    -- 20260425_200_analytics_views.sql and 20260504_006_growth_agent.sql.
    begin
      v_menu_item_id := coalesce(v_item->>'itemId', v_item->>'item_id', v_item->>'id')::uuid;
    exception when others then
      continue;
    end;
    begin
      v_qty := coalesce(
        (v_item->>'quantity')::numeric,
        (v_item->>'qty')::numeric,
        0
      );
    exception when others then
      v_qty := 0;
    end;
    if v_qty <= 0 or v_menu_item_id is null then
      continue;
    end if;

    -- For every recipe row matching this menu item in this tenant, deplete
    -- the linked inventory_item by qty * qty_per_serving.
    for v_recipe in
      select id, inventory_item_id, qty_per_serving
        from public.menu_item_recipes
       where tenant_id = NEW.tenant_id
         and menu_item_id = v_menu_item_id
    loop
      v_delta := v_qty * v_recipe.qty_per_serving;
      if v_delta <= 0 then
        continue;
      end if;

      -- Decrement stock. Allow stock to go negative for now — we surface
      -- it on the dashboard low-stock banner; refusing the delivery here
      -- would block real-world flow.
      update public.inventory_items
         set current_stock = current_stock - v_delta,
             updated_at = now()
       where tenant_id = NEW.tenant_id
         and id = v_recipe.inventory_item_id;

      -- Append ledger row. Composite FK (tenant_id, inventory_item_id)
      -- ensures cross-tenant rows are rejected at insert.
      insert into public.inventory_movements
        (tenant_id, inventory_item_id, delta, reason, order_id, metadata)
      values
        (NEW.tenant_id,
         v_recipe.inventory_item_id,
         -v_delta,
         'ORDER_DELIVERED',
         NEW.id,
         jsonb_build_object(
           'menu_item_id', v_menu_item_id,
           'qty_in_order', v_qty,
           'qty_per_serving', v_recipe.qty_per_serving,
           'recipe_id', v_recipe.id
         ));
    end loop;
  end loop;

  return NEW;
exception when others then
  -- Inventory accounting must never crash the order flow.
  raise warning 'inventory_deplete_on_delivered failed for order %: % %',
    NEW.id, SQLSTATE, SQLERRM;
  return NEW;
end;
$$;

comment on function public.inventory_deplete_on_delivered() is
  'AFTER UPDATE trigger on restaurant_orders. Decrements inventory_items.current_stock and appends an inventory_movements ledger row when status transitions to DELIVERED. Gated by tenants.feature_flags.inventory_enabled. Wrapped in EXCEPTION-WHEN-OTHERS so failures never crash order flow. Composite tenant FKs from migrations 006/007 ensure cross-tenant safety.';

-- ============================================================
-- 2. Trigger
-- ============================================================
drop trigger if exists trg_orders_inventory_deplete_on_delivered
  on public.restaurant_orders;

create trigger trg_orders_inventory_deplete_on_delivered
  after update on public.restaurant_orders
  for each row
  when (NEW.status = 'DELIVERED' and OLD.status is distinct from 'DELIVERED')
  execute function public.inventory_deplete_on_delivered();

-- ============================================================
-- 3. Grants on the function (defense-in-depth)
-- ============================================================
revoke all on function public.inventory_deplete_on_delivered() from public;
revoke all on function public.inventory_deplete_on_delivered() from anon;
revoke all on function public.inventory_deplete_on_delivered() from authenticated;
-- Trigger runs as security definer; no direct callers needed.
