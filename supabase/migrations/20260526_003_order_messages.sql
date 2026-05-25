-- Wave 1.2 — Per-order mini-chat between the tenant and the assigned courier.
--
-- One channel per courier_orders row. Tenant members of source_tenant_id and
-- the assigned courier (assigned_courier_user_id) can SELECT + INSERT. Nobody
-- else (including other couriers in the same fleet) can read. Public anon
-- has no access.
--
-- Designed for short text exchanges ("lipsește numărul de la bloc?", "sunt
-- la intrare A"). 2000 char hard cap; no images / attachments in v1.

create table if not exists public.order_messages (
  id               uuid primary key default gen_random_uuid(),
  courier_order_id uuid not null references public.courier_orders(id) on delete cascade,
  -- Denormalised for fast RLS. Validated by trigger below to match parent.
  tenant_id        uuid references public.tenants(id) on delete set null,
  from_role        text not null check (from_role in ('TENANT','COURIER','SYSTEM')),
  from_user_id     uuid references auth.users(id) on delete set null,
  body             text not null check (length(trim(body)) between 1 and 2000),
  created_at       timestamptz not null default now()
);

create index if not exists ix_order_messages_courier_order_created
  on public.order_messages(courier_order_id, created_at desc);
create index if not exists ix_order_messages_tenant
  on public.order_messages(tenant_id) where tenant_id is not null;

-- Auto-fill tenant_id from parent courier_orders.source_tenant_id on insert.
-- Guards against a stale or wrong client-supplied tenant_id.
create or replace function public.order_messages_set_tenant_id()
returns trigger
language plpgsql
as $$
begin
  select source_tenant_id into new.tenant_id
    from public.courier_orders where id = new.courier_order_id;
  return new;
end;
$$;

drop trigger if exists trg_order_messages_set_tenant on public.order_messages;
create trigger trg_order_messages_set_tenant
  before insert on public.order_messages
  for each row execute function public.order_messages_set_tenant_id();

-- RLS
alter table public.order_messages enable row level security;

-- SELECT: tenant member OR assigned courier on the parent row.
drop policy if exists "order_messages_select_tenant_or_courier" on public.order_messages;
create policy "order_messages_select_tenant_or_courier"
  on public.order_messages
  for select using (
    (
      tenant_id is not null
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

-- INSERT: same rule + the from_user_id must equal auth.uid().
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
      )
      or exists (
        select 1 from public.courier_orders co
         where co.id = order_messages.courier_order_id
           and co.assigned_courier_user_id = auth.uid()
           and from_role = 'COURIER'
      )
    )
  );

-- Realtime publication: opt this table in so postgres_changes streams INSERTs
-- to the per-order channel. Idempotent.
do $$ begin
  alter publication supabase_realtime add table public.order_messages;
exception
  when duplicate_object then null;
  when undefined_object then null; -- publication not present in local dev
end $$;

comment on table public.order_messages is
  'Wave 1.2 — per-order chat between tenant + assigned courier. RLS-scoped: '
  'tenant members of source_tenant_id and the assigned courier on the parent '
  'courier_orders row can SELECT + INSERT; nobody else reads. Short text only '
  '(max 2000 chars), no attachments in v1.';
