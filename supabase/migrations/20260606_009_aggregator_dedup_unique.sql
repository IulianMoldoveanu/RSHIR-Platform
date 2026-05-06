-- Lane AGGREGATOR-EMAIL-INTAKE — atomic dedup hardening (final).
--
-- Codex P1 follow-up #2 on PR #308 commit 7b50500: the unique partial
-- index on restaurant_orders is correct, but supabase-js `upsert(...
-- onConflict: 'tenant_id,source,hir_delivery_id')` cannot serialize a
-- partial index — Postgres needs the WHERE predicate at the conflict
-- target site, and the JS client does not expose it. Plus this migration
-- must run AFTER 20260606_007_order_source_aggregator_values.sql so the
-- enum values used by the predicate are already in place — hence the
-- 20260606_009 timestamp.
--
-- Original 20260506_015 was no-op-deleted in this same PR commit; this
-- migration is the canonical replacement. Idempotent. Re-running is a
-- no-op (uses if not exists / create or replace).
--
-- Components:
--   1. UNIQUE partial index on restaurant_orders (tenant_id, source,
--      hir_delivery_id) WHERE source IN aggregator + hir_delivery_id NOT NULL.
--   2. RPC apply_aggregator_order(...) that does the atomic
--      INSERT ... ON CONFLICT ... WHERE ... DO NOTHING RETURNING and
--      falls back to the deterministic lookup. Returns the order id,
--      a deduped flag, and the inserted-vs-found state.
--
-- service_role only (Edge Function + admin server actions).

create unique index if not exists
  restaurant_orders_aggregator_external_id_uniq
  on public.restaurant_orders (tenant_id, source, hir_delivery_id)
  where source in ('GLOVO','WOLT','BOLT_FOOD','TAZZ','FOODPANDA')
    and hir_delivery_id is not null;

comment on index public.restaurant_orders_aggregator_external_id_uniq is
  'Atomic dedup for aggregator-sourced orders (GLOVO/WOLT/BOLT_FOOD/TAZZ/FOODPANDA): '
  'guarantees no two rows share (tenant_id, source, hir_delivery_id) where '
  'hir_delivery_id stores the aggregator external order id. Used by '
  'public.apply_aggregator_order RPC.';

-- Atomic apply: if an aggregator order with the same
-- (tenant_id, source, hir_delivery_id) exists, return its id with
-- deduped=true; else insert the new row and return its id with
-- deduped=false. The INSERT ... ON CONFLICT WHERE clause matches the
-- partial index predicate exactly, so Postgres serializes correctly
-- under concurrent retries (no race window).
create or replace function public.apply_aggregator_order(
  p_tenant_id uuid,
  p_source text,
  p_external_order_id text,
  p_items jsonb,
  p_subtotal_ron numeric,
  p_delivery_fee_ron numeric,
  p_total_ron numeric,
  p_notes text
) returns table (order_id uuid, deduped boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_deduped boolean := false;
begin
  -- Guard: this RPC is only valid for aggregator sources.
  if p_source not in ('GLOVO','WOLT','BOLT_FOOD','TAZZ','FOODPANDA') then
    raise exception 'apply_aggregator_order: source % not in aggregator allow-list', p_source;
  end if;
  if p_external_order_id is null or length(p_external_order_id) = 0 then
    raise exception 'apply_aggregator_order: p_external_order_id is required';
  end if;

  -- Atomic insert + on-conflict no-op. The WHERE clause matches the
  -- partial index predicate — Postgres uses it to pick the index.
  insert into public.restaurant_orders (
    tenant_id, items, subtotal_ron, delivery_fee_ron, total_ron,
    status, payment_status, source, hir_delivery_id, notes
  )
  values (
    p_tenant_id, p_items, p_subtotal_ron, p_delivery_fee_ron, p_total_ron,
    'CONFIRMED', 'PAID', p_source::public.order_source, p_external_order_id, p_notes
  )
  on conflict (tenant_id, source, hir_delivery_id)
    where source in ('GLOVO','WOLT','BOLT_FOOD','TAZZ','FOODPANDA')
      and hir_delivery_id is not null
  do nothing
  returning id into v_order_id;

  if v_order_id is null then
    -- Conflict path: another invocation won. Look up the winner.
    select id into v_order_id
    from public.restaurant_orders
    where tenant_id = p_tenant_id
      and source = p_source::public.order_source
      and hir_delivery_id = p_external_order_id
    limit 1;
    v_deduped := true;
  end if;

  return query select v_order_id, v_deduped;
end;
$$;

comment on function public.apply_aggregator_order is
  'Atomic dedup-aware insert for aggregator orders. Returns (order_id, deduped). '
  'Used by aggregator-email-parser Edge Function + applyParsedJob server action. '
  'Honors restaurant_orders_aggregator_external_id_uniq partial index.';

-- Lock down: nobody but service_role calls this.
revoke all on function public.apply_aggregator_order(uuid, text, text, jsonb, numeric, numeric, numeric, text) from public;
revoke all on function public.apply_aggregator_order(uuid, text, text, jsonb, numeric, numeric, numeric, text) from anon;
revoke all on function public.apply_aggregator_order(uuid, text, text, jsonb, numeric, numeric, numeric, text) from authenticated;
grant execute on function public.apply_aggregator_order(uuid, text, text, jsonb, numeric, numeric, numeric, text) to service_role;
