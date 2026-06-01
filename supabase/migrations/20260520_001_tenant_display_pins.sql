-- Per-tenant display PIN store.
-- PIN is stored as a scrypt hash (format: scrypt:<salt_hex>:<hash_hex>).
-- Only one active PIN per tenant (unique index on tenant_id).
-- RLS: tenant members may read their own row; writes go through service-role only.

create table if not exists public.tenant_display_pins (
  id         uuid         primary key default gen_random_uuid(),
  tenant_id  uuid         not null references public.tenants(id) on delete cascade,
  pin_hash   text         not null,
  label      text,
  created_at timestamptz  not null default now()
);

create unique index if not exists tenant_display_pins_tenant_id_key
  on public.tenant_display_pins(tenant_id);

alter table public.tenant_display_pins enable row level security;

-- Tenant members can read their own PIN row (needed to verify the hash exists).
drop policy if exists "display_pins_member_select" on public.tenant_display_pins;
create policy "display_pins_member_select"
  on public.tenant_display_pins for select
  using (public.is_tenant_member(tenant_id));
