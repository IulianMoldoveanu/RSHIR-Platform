-- Wave 6 — Split the order_messages thread into three channels so each role
-- only sees what's intended for them.
--
-- Today (Wave 5 baseline):
--   - Tenant + courier shared one thread via order_messages.
--   - Client got injected into the same thread via get_courier_track_messages
--     RPC, which filtered from_role IN ('CLIENT','COURIER','SYSTEM').
--   - That filter LEAKS tenant↔courier chatter to the client because the RPC
--     can't tell which COURIER messages were meant for the tenant.
--
-- This migration introduces an explicit `channel` column:
--   TENANT_COURIER  — visible to tenant members + assigned courier
--   CLIENT_COURIER  — visible to anon-via-track-token + assigned courier
--   BROADCAST       — visible to all (SYSTEM pings, e.g. geofence arrivals)

-- 1. Add column with conservative default.
alter table public.order_messages
  add column if not exists channel text not null default 'BROADCAST';

alter table public.order_messages
  drop constraint if exists order_messages_channel_check;
alter table public.order_messages
  add constraint order_messages_channel_check
  check (channel in ('TENANT_COURIER','CLIENT_COURIER','BROADCAST'));

-- 2. Atomic backfill — preserve current visibility surface for pre-Wave-6 rows.
--    TENANT  → TENANT_COURIER (was tenant↔courier only, by old SELECT policy)
--    COURIER → TENANT_COURIER (was tenant↔courier only — client RPC didn't exist
--                              when these were written)
--    CLIENT  → CLIENT_COURIER (existed only post-Wave-5 via the RPC)
--    SYSTEM  → BROADCAST       (meant for everyone, including geofence pings)
update public.order_messages
   set channel = case
     when from_role in ('TENANT','COURIER') then 'TENANT_COURIER'
     when from_role = 'CLIENT' then 'CLIENT_COURIER'
     else 'BROADCAST'
   end
 where channel = 'BROADCAST'
   and from_role <> 'SYSTEM';

create index if not exists ix_order_messages_courier_order_channel
  on public.order_messages(courier_order_id, channel, created_at desc);

-- 3. Tighten SELECT RLS: tenant members can no longer see CLIENT_COURIER rows.
--    Courier still sees ALL channels on their own order.
drop policy if exists "order_messages_select_tenant_or_courier" on public.order_messages;
create policy "order_messages_select_tenant_or_courier"
  on public.order_messages
  for select using (
    (
      tenant_id is not null
      and channel in ('TENANT_COURIER','BROADCAST')
      and exists (
        select 1 from public.tenant_members tm
         where tm.tenant_id = order_messages.tenant_id
           and tm.user_id = auth.uid()
      )
    )
    or exists (
      select 1 from public.courier_orders co
       where co.id = order_messages.courier_order_id
         and co.assigned_courier_user_id = auth.uid()
    )
  );

-- 4. Tighten INSERT RLS: TENANT senders may only write TENANT_COURIER or
--    BROADCAST; COURIER senders may pick any of the three (their replies route).
drop policy if exists "order_messages_insert_tenant_or_courier" on public.order_messages;
create policy "order_messages_insert_tenant_or_courier"
  on public.order_messages
  for insert with check (
    from_user_id = auth.uid()
    and from_role in ('TENANT','COURIER')
    and (
      exists (
        select 1 from public.courier_orders co
         where co.id = order_messages.courier_order_id
           and co.source_tenant_id is not null
           and exists (
             select 1 from public.tenant_members tm
              where tm.tenant_id = co.source_tenant_id
                and tm.user_id = auth.uid()
           )
           and from_role = 'TENANT'
           and order_messages.channel in ('TENANT_COURIER','BROADCAST')
      )
      or exists (
        select 1 from public.courier_orders co
         where co.id = order_messages.courier_order_id
           and co.assigned_courier_user_id = auth.uid()
           and from_role = 'COURIER'
           and order_messages.channel in ('TENANT_COURIER','CLIENT_COURIER','BROADCAST')
      )
    )
  );

-- 5. Update the client-facing RPCs to filter on channel.
create or replace function public.get_courier_track_messages(p_track_token text, p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_msgs jsonb;
begin
  select id into v_order_id
    from public.courier_orders
   where public_track_token = p_track_token
   limit 1;

  if v_order_id is null then
    return jsonb_build_array();
  end if;

  select coalesce(jsonb_agg(row_to_json(m) order by m.created_at), '[]'::jsonb)
    into v_msgs
  from (
    select id, from_role, body, created_at
      from public.order_messages
     where courier_order_id = v_order_id
       and channel in ('CLIENT_COURIER','BROADCAST')
     order by created_at desc
     limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) m;

  return v_msgs;
end;
$$;

-- The post_courier_track_message RPC now writes CLIENT_COURIER explicitly.
create or replace function public.post_courier_track_message(p_track_token text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.courier_orders%rowtype;
  v_msg_id uuid;
  v_body text;
begin
  v_body := trim(coalesce(p_body, ''));
  if length(v_body) < 1 or length(v_body) > 2000 then
    return jsonb_build_object('error','invalid_body');
  end if;

  select * into v_order
    from public.courier_orders
   where public_track_token = p_track_token
   limit 1;

  if not found then
    return jsonb_build_object('error','not_found');
  end if;

  if v_order.status in ('DELIVERED','CANCELLED') then
    return jsonb_build_object('error','order_closed');
  end if;

  insert into public.order_messages (
    courier_order_id, tenant_id, from_role, from_user_id, body, channel
  ) values (
    v_order.id, v_order.source_tenant_id, 'CLIENT', null, v_body, 'CLIENT_COURIER'
  )
  returning id into v_msg_id;

  return jsonb_build_object('ok', true, 'id', v_msg_id);
end;
$$;

comment on column public.order_messages.channel is
  'Visibility channel: TENANT_COURIER (tenant + courier), CLIENT_COURIER '
  '(client via track token + courier), or BROADCAST (everyone — used for '
  'SYSTEM pings like geofence arrival messages).';
