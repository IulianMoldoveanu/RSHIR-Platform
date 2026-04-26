-- HIR Restaurant Suite — RSHIR-56
-- Customer status email: AFTER UPDATE OF status on restaurant_orders fires
-- the `notify-customer-status` Edge Function via pg_net. MVP scope: only
-- the CONFIRMED transition is wired to a real email; the trigger filter
-- below keeps the WHEN clause narrow so the Edge Function is invoked only
-- when there's something to do.
--
-- Reuses notify_new_order_secret + a new notify_customer_status_url vault
-- entry. If either is missing the function silently no-ops, so the
-- migration is safe to apply before secrets are seeded.
--
-- Operator setup (run ONCE, separately):
--   select vault.create_secret(
--     '<https://qfmeojeipncuxeltnvab.functions.supabase.co/notify-customer-status>',
--     'notify_customer_status_url',
--     'notify-customer-status Edge Function URL');
-- HIR_NOTIFY_SECRET is already set on the function via existing secret;
-- the trigger reuses notify_new_order_secret.
--
-- Idempotent: re-runnable.

create or replace function public.notify_customer_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notify_customer_status_url' limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify_new_order_secret' limit 1;
  if v_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',        'application/json',
      'x-hir-notify-secret', v_secret
    ),
    body    := jsonb_build_object(
      'order_id',  new.id,
      'tenant_id', new.tenant_id,
      'status',    new.status
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_orders_notify_customer_status on public.restaurant_orders;
create trigger trg_orders_notify_customer_status
  after update of status on public.restaurant_orders
  for each row
  when (
    new.status in ('CONFIRMED','READY','DISPATCHED','IN_DELIVERY')
    and new.status is distinct from old.status
  )
  execute function public.notify_customer_status_changed();
