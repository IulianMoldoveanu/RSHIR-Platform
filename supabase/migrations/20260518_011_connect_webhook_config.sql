-- HIR Connect: outbound order-status webhooks with HMAC signing + dead-letter
-- Depends on 20260518_010_connect_tenant_mode.sql (adds tenants.delivery_mode)

create extension if not exists pgcrypto;

-- Per-tenant webhook endpoint
create table if not exists public.connect_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  url text not null check (url ~ '^https://'),
  signing_secret_hash text not null,
  signing_secret_previous_hash text,
  signing_secret_previous_expires_at timestamptz,
  events text[] not null default array['order.created','order.status_changed','order.delivered','order.cancelled'],
  active boolean not null default true,
  consecutive_failures int not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create unique index if not exists ix_connect_endpoints_one_active_per_tenant
  on public.connect_webhook_endpoints(tenant_id) where active = true;
create index if not exists ix_connect_endpoints_tenant
  on public.connect_webhook_endpoints(tenant_id);

-- Delivery log
create table if not exists public.connect_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.connect_webhook_endpoints(id) on delete cascade,
  tenant_id uuid not null,
  event_type text not null,
  order_id uuid,
  request_body jsonb not null,
  response_status int,
  response_body_truncated text,
  attempt_count int not null default 0,
  next_retry_at timestamptz not null default now(),
  delivered_at timestamptz,
  dead boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ix_connect_deliveries_pending
  on public.connect_webhook_deliveries(next_retry_at)
  where delivered_at is null and dead = false;
create index if not exists ix_connect_deliveries_endpoint_created
  on public.connect_webhook_deliveries(endpoint_id, created_at desc);

-- RLS
alter table public.connect_webhook_endpoints enable row level security;
alter table public.connect_webhook_deliveries enable row level security;

drop policy if exists "members read own endpoints" on public.connect_webhook_endpoints;
create policy "members read own endpoints" on public.connect_webhook_endpoints
  for select using (
    exists (select 1 from public.tenant_members tm
            where tm.tenant_id = connect_webhook_endpoints.tenant_id
              and tm.user_id = auth.uid())
  );

drop policy if exists "members read own deliveries" on public.connect_webhook_deliveries;
create policy "members read own deliveries" on public.connect_webhook_deliveries
  for select using (
    exists (select 1 from public.tenant_members tm
            where tm.tenant_id = connect_webhook_deliveries.tenant_id
              and tm.user_id = auth.uid())
  );

-- Trigger: enqueue webhook deliveries on order changes for headless tenants
create or replace function public.connect_enqueue_order_webhook()
returns trigger
language plpgsql
security definer
as $$
declare
  v_mode text;
  v_endpoint record;
  v_event text;
begin
  select delivery_mode::text into v_mode
    from public.tenants where id = new.tenant_id;
  if v_mode is null or v_mode <> 'headless' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_event := 'order.created';
  elsif tg_op = 'UPDATE' and (new.status is distinct from old.status) then
    if new.status = 'DELIVERED' then
      v_event := 'order.delivered';
    elsif new.status = 'CANCELLED' then
      v_event := 'order.cancelled';
    else
      v_event := 'order.status_changed';
    end if;
  else
    return new;
  end if;

  for v_endpoint in
    select * from public.connect_webhook_endpoints
     where tenant_id = new.tenant_id
       and active = true
       and v_event = any(events)
  loop
    insert into public.connect_webhook_deliveries
      (endpoint_id, tenant_id, event_type, order_id, request_body)
    values (
      v_endpoint.id,
      new.tenant_id,
      v_event,
      new.id,
      jsonb_build_object(
        'event', v_event,
        'tenant_id', new.tenant_id,
        'order', to_jsonb(new),
        'previous_status', case when tg_op = 'UPDATE' then old.status else null end,
        'occurred_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_connect_order_webhook on public.restaurant_orders;
create trigger trg_connect_order_webhook
  after insert or update of status on public.restaurant_orders
  for each row execute function public.connect_enqueue_order_webhook();

-- RPC: secure lookup of signing secrets from vault for the dispatcher
-- Service-role only (the Edge Function calls it). Returns plaintext secrets
-- keyed by endpoint_id. Vault entries are named `connect_webhook_secret_<id>`.
create or replace function public.connect_get_endpoint_secrets(endpoint_ids uuid[])
returns table (endpoint_id uuid, secret text)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  return query
    select e.id as endpoint_id,
           (select decrypted_secret from vault.decrypted_secrets
             where name = 'connect_webhook_secret_' || e.id::text
             limit 1) as secret
      from public.connect_webhook_endpoints e
     where e.id = any(endpoint_ids);
end;
$$;
revoke all on function public.connect_get_endpoint_secrets(uuid[]) from public, authenticated, anon;
grant execute on function public.connect_get_endpoint_secrets(uuid[]) to service_role;

-- Vault helper: idempotent create-or-update for connect webhook secrets.
-- Used by the onboarding + rotate-secret API routes.
create or replace function public.vault_create_or_update_secret(secret_name text, secret_value text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = secret_name limit 1;
  if v_id is null then
    perform vault.create_secret(secret_value, secret_name, null);
  else
    perform vault.update_secret(v_id, secret_value, secret_name, null);
  end if;
end;
$$;
revoke all on function public.vault_create_or_update_secret(text, text) from public, authenticated, anon;
grant execute on function public.vault_create_or_update_secret(text, text) to service_role;

-- Cron: 30s dispatcher tick
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'connect-webhook-dispatch') then
    perform cron.schedule(
      'connect-webhook-dispatch',
      '30 seconds',
      $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets
                where name = 'connect_webhook_dispatcher_url' limit 1),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-hir-notify-secret', (select decrypted_secret from vault.decrypted_secrets
                                  where name = 'notify_new_order_secret' limit 1)
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  end if;
end$$;

comment on table public.connect_webhook_endpoints is
  'HIR Connect: outbound webhook configuration per headless tenant. One active endpoint per tenant. '
  'Signing secret stored as bcrypt-style hash (never plaintext).';
comment on table public.connect_webhook_deliveries is
  'HIR Connect: delivery log + retry queue. Exponential backoff [30s, 2m, 10m, 1h, 6h, 24h]; '
  'dead-letter after 7 attempts (sets endpoint.active=false).';
