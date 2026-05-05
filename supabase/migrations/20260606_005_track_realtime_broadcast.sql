-- Lane RT-PUSH — real-time order status broadcast for the customer track page.
--
-- Adds a SECOND status-change side-effect alongside the existing
-- `notify_customer_status_changed()` (which sends an email + Web Push). This
-- one fires for ALL meaningful status transitions and invokes a new
-- `track-broadcast` Edge Function which posts to the per-token Supabase
-- Realtime channel `track:<public_track_token>`.
--
-- Two triggers (independent firings) keeps blast radius tight: a future
-- change to the email path can't break the broadcast path and vice-versa.
--
-- Operator setup (run ONCE, separately, AFTER the Edge Function is deployed):
--   select vault.create_secret(
--     'https://<project>.functions.supabase.co/track-broadcast',
--     'track_broadcast_url',
--     'track-broadcast Edge Function URL');
--
-- The shared secret reuses `notify_new_order_secret` (already in vault); the
-- Edge Function validates it via the `x-hir-notify-secret` header.
--
-- Idempotent: re-runnable. If the vault secret is missing the trigger
-- silently no-ops, so the migration is safe to apply before the function is
-- deployed.

create or replace function public.notify_track_broadcast()
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
    from vault.decrypted_secrets where name = 'track_broadcast_url' limit 1;
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

drop trigger if exists trg_orders_notify_track_broadcast on public.restaurant_orders;
create trigger trg_orders_notify_track_broadcast
  after update of status on public.restaurant_orders
  for each row
  when (
    new.status in (
      'CONFIRMED','PREPARING','READY','DISPATCHED','IN_DELIVERY','DELIVERED','CANCELLED'
    )
    and new.status is distinct from old.status
  )
  execute function public.notify_track_broadcast();
