-- HIR Restaurant Suite — RSHIR-18
-- Order-paid email notification: AFTER UPDATE of payment_status fires the
-- `notify-new-order` Edge Function via pg_net.
--
-- Idempotent: drops + recreates the function/trigger on each apply.
--
-- Why UPDATE (not INSERT): orders are created at PaymentIntent time with
-- payment_status='UNPAID' and the storefront-finalize handler flips it to
-- 'PAID' after Stripe confirms. We only want to email when that flip lands.
--
-- Auth choice: Supabase Edge Functions require a JWT. We send the project's
-- anon JWT in the `Authorization` header (it's a public token; the function
-- itself uses the auto-injected SUPABASE_SERVICE_ROLE_KEY for DB lookups).
-- Both the function URL and the anon JWT live in vault.secrets so they can
-- be rotated without a migration.
--
-- Operator setup (run ONCE, separately, with the real values):
--   select vault.create_secret(
--     '<https://qfmeojeipncuxeltnvab.functions.supabase.co/notify-new-order>',
--     'notify_new_order_url',
--     'notify-new-order Edge Function URL');
--   select vault.create_secret(
--     '<anon-jwt>',
--     'notify_new_order_auth',
--     'anon JWT used by pg_net to invoke notify-new-order');
-- If either secret is missing, the trigger silently no-ops (so the migration
-- is safe to apply before secrets are seeded).

create extension if not exists pg_net;

create or replace function public.notify_new_order_paid()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url   text;
  v_auth  text;
begin
  -- Look up the function URL + auth header from vault. If either is missing
  -- we just skip the call — keeps the migration safe to apply pre-secret-seed
  -- and lets ops rotate without re-running the migration.
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notify_new_order_url' limit 1;
  select decrypted_secret into v_auth
    from vault.decrypted_secrets where name = 'notify_new_order_auth' limit 1;
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
      'order_id',  new.id,
      'tenant_id', new.tenant_id
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_orders_notify_paid on public.restaurant_orders;
create trigger trg_orders_notify_paid
  after update of payment_status on public.restaurant_orders
  for each row
  when (new.payment_status = 'PAID' and old.payment_status is distinct from 'PAID')
  execute function public.notify_new_order_paid();
