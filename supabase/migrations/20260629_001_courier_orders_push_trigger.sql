-- Bidi-sync push pipeline fix: AFTER INSERT trigger on courier_orders that
-- invokes the courier-push-dispatch Edge Function via pg_net so couriers
-- with the app in background / screen-off receive an OS-level notification
-- the moment a new order lands in their fleet queue.
--
-- Problem this solves
-- -------------------
-- The bidi-sync trigger (20260620_004) inserts into courier_orders when a
-- restaurant_orders row flips to DISPATCHED, but never pings the push
-- pipeline. Result: the courier_orders row exists in DB, the realtime feed
-- updates only for couriers who have the app in the foreground, and every
-- courier whose phone is locked / app backgrounded gets nothing. This was
-- silently breaking dispatch on prod.
--
-- Design notes
-- ------------
-- * Idempotency: courier_orders.courier_push_dispatched_at is set inside the
--   trigger via UPDATE WHERE IS NULL. A second invocation (replays, retries,
--   the EXTERNAL_API route also calling dispatchCourierPushForNewOrder
--   directly) becomes a no-op.
-- * Gating: trigger fires for source_type in ('HIR_TENANT','EXTERNAL_API').
--   For tenants with external_dispatch_enabled=true the route.ts call in
--   apps/restaurant-courier/src/app/api/external/orders/route.ts already
--   handles dispatch in-process, so the trigger backs off to avoid the
--   double-fire path. Same idempotency column guards both directions.
-- * Vault secrets: function URL + service-role JWT live in
--   vault.decrypted_secrets so they rotate without a migration. If either
--   is missing the trigger silently no-ops (safe to apply pre-seed).
--
-- Operator setup (run ONCE, separately, with real values):
--   select vault.create_secret(
--     '<https://qfmeojeipncuxeltnvab.functions.supabase.co/courier-push-dispatch>',
--     'courier_push_dispatch_url',
--     'courier-push-dispatch Edge Function URL');
--   select vault.create_secret(
--     '<service-role-jwt>',
--     'courier_push_dispatch_auth',
--     'service-role JWT used by pg_net to invoke courier-push-dispatch');

create extension if not exists pg_net;

-- Idempotency column. Set the first time the trigger (or the in-process
-- route.ts helper) successfully kicks off a dispatch. Replays of the
-- trigger become no-ops on the second pass.
alter table public.courier_orders
  add column if not exists courier_push_dispatched_at timestamptz;

create or replace function public.dispatch_courier_push_on_new_order()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url                text;
  v_auth               text;
  v_external_dispatch  boolean;
  v_claimed            boolean;
begin
  -- Only HIR-internal flows. MANUAL inserts (operator scaffolding test data)
  -- shouldn't wake every courier in the fleet.
  if new.source_type not in ('HIR_TENANT','EXTERNAL_API') then
    return new;
  end if;

  if new.fleet_id is null then
    return new;
  end if;

  -- If the tenant runs their own external dispatch path the in-process
  -- helper in route.ts already fires courier-push-dispatch directly, so the
  -- trigger backs off to avoid a duplicate push.
  if new.source_tenant_id is not null then
    select external_dispatch_enabled
      into v_external_dispatch
      from public.tenants
      where id = new.source_tenant_id;
    if v_external_dispatch is true then
      return new;
    end if;
  end if;

  -- Atomic claim: only the first writer to flip dispatched_at proceeds.
  -- Replays / concurrent retries see nothing and drop out cleanly.
  update public.courier_orders
     set courier_push_dispatched_at = now()
   where id = new.id
     and courier_push_dispatched_at is null
  returning true into v_claimed;

  if v_claimed is not true then
    return new;
  end if;

  -- Pull vault secrets. Missing config → silent no-op (safe to apply this
  -- migration before secrets are seeded).
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
      'fleet_id', new.fleet_id,
      'order_id', new.id,
      'urgent',   true
    )
  );

  return new;
end;
$$;

comment on function public.dispatch_courier_push_on_new_order is
  'AFTER INSERT trigger on courier_orders. Fires courier-push-dispatch via '
  'pg_net so backgrounded couriers in the fleet receive an OS notification '
  'the instant a new bidi-synced or external-API order lands. Idempotent via '
  'courier_orders.courier_push_dispatched_at. Skips when '
  'tenants.external_dispatch_enabled=true (route.ts handles dispatch '
  'directly in that case).';

drop trigger if exists trg_courier_orders_push_dispatch on public.courier_orders;
create trigger trg_courier_orders_push_dispatch
  after insert on public.courier_orders
  for each row
  execute function public.dispatch_courier_push_on_new_order();
