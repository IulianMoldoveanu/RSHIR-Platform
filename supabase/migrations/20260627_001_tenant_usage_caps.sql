-- Content OS — Standard plan usage caps (server-side enforcement).
--
-- Pricing locked 2026-05-27: every RO tenant on Standard at 2 RON/order.
-- To prevent cost runaway on Anthropic / video gen / WhatsApp marketing,
-- we hard-cap the four AI/marketing resources below:
--
--   resource_kind         cap     period     reset
--   ─────────────────────────────────────────────
--   hepi_conversations     10     daily      midnight UTC
--   content_os_videos       3     monthly    1st 00:00 UTC
--   whatsapp_marketing     30     monthly    1st 00:00 UTC
--   anthropic_tokens   50000     daily      midnight UTC
--
-- One row per (tenant_id, resource_kind, period_start). Atomic
-- check+increment via `public.check_and_increment_usage(...)` — callers
-- read `allowed` and short-circuit on false. The same RPC seeds the cap
-- on first hit so no out-of-band cron is needed.
--
-- RLS: tenant members read OWN counters (banner UI on /dashboard/content).
-- Writes are service_role only — the RPC is SECURITY DEFINER so it
-- escapes RLS for the row update but the caller still passes a verified
-- tenant_id (callers must have already authenticated the session).
--
-- Re-applying is safe: `if not exists` on every CREATE.

create table if not exists public.tenant_usage_counters (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references public.tenants(id) on delete cascade,
  resource_kind   text        not null check (resource_kind in (
    'hepi_conversations',
    'content_os_videos',
    'whatsapp_marketing',
    'anthropic_tokens'
  )),
  -- Start of the window: daily = date_trunc('day', now() AT TIME ZONE 'UTC'),
  -- monthly = date_trunc('month', now() AT TIME ZONE 'UTC').
  period_start    timestamptz not null,
  period_kind     text        not null check (period_kind in ('daily', 'monthly')),
  used_count      int         not null default 0,
  cap_count       int         not null,
  last_reset_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, resource_kind, period_start)
);

create index if not exists idx_usage_counters_tenant_resource
  on public.tenant_usage_counters (tenant_id, resource_kind, period_start);

alter table public.tenant_usage_counters enable row level security;

drop policy if exists "tenant_members_read_own_counters"
  on public.tenant_usage_counters;
create policy "tenant_members_read_own_counters"
  on public.tenant_usage_counters
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists "tenant_usage_counters_service_role_all"
  on public.tenant_usage_counters;
create policy "tenant_usage_counters_service_role_all"
  on public.tenant_usage_counters
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.tenant_usage_counters is
  'Server-side caps for Standard plan resources. One row per (tenant, resource, window). Atomic update via check_and_increment_usage RPC.';


-- ---------------------------------------------------------------------------
-- Atomic check + increment RPC.
--
-- Returns jsonb { allowed, used, cap, period_kind, period_start }.
-- When `allowed` is false the caller MUST short-circuit (return 429 / throw).
-- The RPC is SECURITY DEFINER + restricted to service_role so we can both
-- update the counter row and bypass the (authenticated-only) SELECT policy
-- — the admin app calls this via the service-role client after it has
-- already verified the session.
-- ---------------------------------------------------------------------------
create or replace function public.check_and_increment_usage(
  p_tenant_id     uuid,
  p_resource_kind text,
  p_amount        int default 1,
  p_cap_override  int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_kind   text;
  v_period_start  timestamptz;
  v_cap           int;
  v_current_used  int;
  v_new_used      int;
begin
  -- Period_kind table — must match the helper in apps/restaurant-admin/src/lib/usage-caps.ts.
  v_period_kind := case p_resource_kind
    when 'hepi_conversations' then 'daily'
    when 'anthropic_tokens'   then 'daily'
    when 'content_os_videos'  then 'monthly'
    when 'whatsapp_marketing' then 'monthly'
    else null
  end;
  if v_period_kind is null then
    raise exception 'check_and_increment_usage: unknown resource_kind %', p_resource_kind
      using errcode = '22023';
  end if;

  v_period_start := case v_period_kind
    when 'daily'   then date_trunc('day',   timezone('UTC', now()))
    when 'monthly' then date_trunc('month', timezone('UTC', now()))
  end;

  -- Default caps — keep in sync with usage-caps.ts DEFAULT_CAPS.
  v_cap := coalesce(p_cap_override, case p_resource_kind
    when 'hepi_conversations' then 10
    when 'content_os_videos'  then 3
    when 'whatsapp_marketing' then 30
    when 'anthropic_tokens'   then 50000
  end);

  if p_amount is null or p_amount <= 0 then
    raise exception 'check_and_increment_usage: p_amount must be > 0, got %', p_amount
      using errcode = '22023';
  end if;

  -- Seed the row on first hit. ON CONFLICT DO NOTHING is safe because the
  -- subsequent FOR UPDATE locks the row regardless of insert vs existing.
  insert into public.tenant_usage_counters (
    tenant_id, resource_kind, period_start, period_kind, used_count, cap_count
  ) values (
    p_tenant_id, p_resource_kind, v_period_start, v_period_kind, 0, v_cap
  )
  on conflict (tenant_id, resource_kind, period_start) do nothing;

  select used_count into v_current_used
    from public.tenant_usage_counters
   where tenant_id     = p_tenant_id
     and resource_kind = p_resource_kind
     and period_start  = v_period_start
   for update;

  v_new_used := v_current_used + p_amount;

  if v_new_used > v_cap then
    return jsonb_build_object(
      'allowed',      false,
      'used',         v_current_used,
      'cap',          v_cap,
      'period_kind',  v_period_kind,
      'period_start', v_period_start
    );
  end if;

  update public.tenant_usage_counters
     set used_count = v_new_used,
         updated_at = now()
   where tenant_id     = p_tenant_id
     and resource_kind = p_resource_kind
     and period_start  = v_period_start;

  return jsonb_build_object(
    'allowed',      true,
    'used',         v_new_used,
    'cap',          v_cap,
    'period_kind',  v_period_kind,
    'period_start', v_period_start
  );
end;
$$;

revoke all on function public.check_and_increment_usage(uuid, text, int, int) from public;
grant execute on function public.check_and_increment_usage(uuid, text, int, int) to service_role;

comment on function public.check_and_increment_usage is
  'Atomic cap enforcement for Content OS / Hepi / Anthropic. Returns { allowed, used, cap, period_kind, period_start }. Callers MUST short-circuit on allowed=false.';
