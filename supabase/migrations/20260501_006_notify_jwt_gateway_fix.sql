-- HIR Restaurant Suite — RSHIR-57 (gateway fix)
-- pg_net.http_post requests to *.functions.supabase.co are rejected with
-- UNAUTHORIZED_NO_AUTH_HEADER unless an Authorization header is present,
-- regardless of the function's verify_jwt setting. This was missed when
-- 20260428_600 stripped the Authorization in favor of x-hir-notify-secret
-- — notify-new-order trigger has been silently 401-ing in prod since.
--
-- This migration restores the Authorization Bearer header on BOTH
-- notification triggers (the secret in x-hir-notify-secret remains the
-- real auth check; Authorization is just gateway plumbing).
--
-- Operator setup (run ONCE):
--   select vault.create_secret(<anon-jwt>, 'notify_function_anon_jwt', 'gateway shim for pg_net');
--
-- Idempotent: re-runnable.

create or replace function public.notify_new_order_paid()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url    text;
  v_secret text;
  v_jwt    text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notify_new_order_url' limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify_new_order_secret' limit 1;
  select decrypted_secret into v_jwt
    from vault.decrypted_secrets where name = 'notify_function_anon_jwt' limit 1;
  if v_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',        'application/json',
      'Authorization',       'Bearer ' || coalesce(v_jwt, ''),
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

create or replace function public.notify_customer_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url    text;
  v_secret text;
  v_jwt    text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notify_customer_status_url' limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify_new_order_secret' limit 1;
  select decrypted_secret into v_jwt
    from vault.decrypted_secrets where name = 'notify_function_anon_jwt' limit 1;
  if v_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',        'application/json',
      'Authorization',       'Bearer ' || coalesce(v_jwt, ''),
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
