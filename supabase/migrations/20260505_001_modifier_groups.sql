-- Modifier groups for size variants + required choices (pizza S/M/L,
-- drinks 0.33/0.5/1L, sauce-pick-one, etc.). Existing flat modifier
-- rows continue to work — group_id stays NULL for them and the UI
-- renders them as the legacy "Extra opțiuni" optional list.
--
-- Schema choice: separate groups table (rather than embedding
-- group fields per modifier) — required/min/max are *per group*,
-- not per option, and embedding them per-row would invite drift.

create table if not exists restaurant_menu_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references restaurant_menu_items(id) on delete cascade,
  name text not null,
  is_required boolean not null default false,
  -- min/max constraints. select_max NULL = unlimited (rare for size,
  -- normal for "toppings"). Required implies select_min >= 1.
  select_min int not null default 0,
  select_max int,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint mod_grp_min_nonneg check (select_min >= 0),
  constraint mod_grp_max_positive check (select_max is null or select_max >= 1),
  constraint mod_grp_max_gte_min check (select_max is null or select_max >= select_min),
  constraint mod_grp_required_implies_min check (not is_required or select_min >= 1)
);

create index if not exists modifier_groups_item_idx
  on restaurant_menu_modifier_groups (item_id, sort_order);

-- Hook each modifier into a group (optional — NULL is the legacy
-- "ungrouped optional" pattern). Cascade delete: dropping a group
-- drops its options.
alter table restaurant_menu_modifiers
  add column if not exists group_id uuid references restaurant_menu_modifier_groups(id) on delete cascade,
  add column if not exists sort_order int not null default 0;

create index if not exists modifiers_group_idx
  on restaurant_menu_modifiers (group_id, sort_order)
  where group_id is not null;

-- RLS: groups inherit tenant scope through item_id → restaurant_menu_items.
-- Admin client bypasses RLS; we don't expose direct group reads to the
-- storefront — getMenuByTenant joins them server-side. Skip RLS policies
-- for now (matching the pattern of restaurant_menu_modifiers).
alter table restaurant_menu_modifier_groups enable row level security;
