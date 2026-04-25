-- HIR Restaurant Suite — RSHIR-22
-- Replace the public anon-JWT auth on the order-paid trigger with a
-- function-scoped shared secret. The previous design (20260427_510)
-- sent the project's anon JWT in `Authorization`, which is a public
-- value — anyone with the function URL could invoke it. The Edge
-- Function only filtered on RLS-style lookups, so a knowledgeable
-- attacker could enumerate orders.
--
-- New design:
--   * vault.secrets has a fresh `notify_new_order_secret` (random
--     64-char hex), seeded by the operator out-of-band.
--   * The trigger sends it as `x-hir-notify-secret` (NOT in
--     Authorization, to leave the platform JWT layer untouched).
--   * The Edge Function checks `Deno.env.get('HIR_NOTIFY_SECRET')`
--     against the header and 401s before any DB read.
--
-- Idempotent: drops + recreates the trigger and function. Safe to
-- re-apply.
--
-- Operator setup (run ONCE, separately, with the real value):
--   select vault.create_secret(
--     '<64-char-hex>',
--     'notify_new_order_secret',
--     'shared secret used by pg_net to authenticate to notify-new-order');
--   -- and on the function side:
--   supabase secrets set HIR_NOTIFY_SECRET=<same-value> \
--     --project-ref qfmeojeipncuxeltnvab
-- The legacy `notify_new_order_auth` vault secret (anon JWT) is no
-- longer read; it can be removed by the operator after this lands.

create or replace function public.notify_new_order_paid()
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
    from vault.decrypted_secrets where name = 'notify_new_order_url' limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify_new_order_secret' limit 1;
  -- If either secret is missing, no-op so the migration is safe to
  -- apply before the operator seeds the new vault entry.
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
