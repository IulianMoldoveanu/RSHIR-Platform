-- Multi-location brand family — let one OWNER run multiple physical
-- locations under the same brand, while keeping per-location tenants
-- fully isolated (RLS, menus, orders, branding).
--
-- Model:
--   parent_brand_id IS NULL  → brand root (or standalone tenant)
--   parent_brand_id = X      → sibling location whose root is X
--   brand_family of tenant T = all rows where COALESCE(parent_brand_id, id)
--                              equals COALESCE(T.parent_brand_id, T.id)
--
-- We deliberately keep it a flat two-level hierarchy (root + siblings)
-- to avoid recursive CTEs at read time. A sibling can NOT itself be a
-- parent — enforced by a trigger below.

-- ── 1. Column + index + self-FK ───────────────────────────────────────

alter table public.tenants
  add column if not exists parent_brand_id uuid references public.tenants(id) on delete set null;

create index if not exists ix_tenants_parent_brand_id
  on public.tenants(parent_brand_id)
  where parent_brand_id is not null;

-- A tenant cannot be its own parent.
do $$ begin
  alter table public.tenants
    add constraint chk_tenants_no_self_parent
    check (parent_brand_id is null or parent_brand_id <> id);
exception when duplicate_object then null; end $$;

-- ── 2. Trigger: prevent 3-level chains (sibling-of-sibling) ───────────

create or replace function public.tenants_enforce_flat_brand_hierarchy()
returns trigger
language plpgsql
as $$
declare
  v_grandparent uuid;
begin
  if new.parent_brand_id is null then
    return new;
  end if;

  -- The proposed parent must itself be a root (parent_brand_id IS NULL).
  select parent_brand_id into v_grandparent
    from public.tenants
   where id = new.parent_brand_id;

  if v_grandparent is not null then
    raise exception 'parent_brand_id must reference a brand ROOT (parent_brand_id IS NULL). Tenant % is itself a child of %.', new.parent_brand_id, v_grandparent;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tenants_flat_brand on public.tenants;
create trigger trg_tenants_flat_brand
  before insert or update of parent_brand_id on public.tenants
  for each row execute function public.tenants_enforce_flat_brand_hierarchy();

-- ── 3. Helper function: brand_root_id(tenant_id) ──────────────────────

create or replace function public.brand_root_id(p_tenant_id uuid)
returns uuid
language sql
stable
as $$
  select coalesce(t.parent_brand_id, t.id)
    from public.tenants t
   where t.id = p_tenant_id;
$$;

-- ── 4. View: tenant_brand_family ──────────────────────────────────────
-- Flat list of (tenant_id, brand_root_id, role_in_brand, name, slug, city_id).
-- Use this to roll up KPI in the dashboard without recursive CTEs.

drop view if exists public.tenant_brand_family;
create view public.tenant_brand_family as
select
  t.id                                        as tenant_id,
  coalesce(t.parent_brand_id, t.id)           as brand_root_id,
  case
    when t.parent_brand_id is null then 'ROOT'
    else 'SIBLING'
  end                                         as role_in_brand,
  t.name,
  t.slug,
  t.city_id,
  t.delivery_mode,
  t.status,
  t.created_at
from public.tenants t;

comment on view public.tenant_brand_family is
  'Flat brand-family view. Use brand_root_id to GROUP BY or JOIN when '
  'aggregating across all locations of the same brand. NULL parent_brand_id '
  'means standalone tenant; in that case brand_root_id == tenant_id.';

comment on column public.tenants.parent_brand_id is
  'Optional self-FK to another tenants.id (the brand ROOT). NULL = brand '
  'root or standalone tenant. Enforced flat (sibling cannot also be a parent) '
  'via trg_tenants_flat_brand trigger.';
