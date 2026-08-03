-- Modifier groups have been unreadable by everyone since they shipped.
--
-- 20260505_001_modifier_groups.sql created restaurant_menu_modifier_groups and
-- ran `enable row level security` on it, but never added a single policy. RLS
-- with no policy denies every role, so:
--
--   * storefronts (anon) fetched groups and silently got zero rows — the query
--     succeeds, `data` is `[]`, and `getMenuByTenant` attaches no groups, so a
--     tenant who configured "Size: small / large (required)" had it vanish from
--     their menu with no error anywhere;
--   * tenant members (authenticated) could not read or write them either, so
--     admin could not manage what it had just saved.
--
-- Verified on production 2026-08-03: rowsecurity = true, policy count = 0.
--
-- These two mirror the ones restaurant_menu_modifiers already has, exactly —
-- same shape, same predicate, one level of indirection through the item:
--   menu_modifiers_anon_select : item is available
--   menu_modifiers_member_all  : is_tenant_member(item.tenant_id)
--
-- Idempotent: drop-then-create, so re-running is safe.

begin;

drop policy if exists menu_modifier_groups_anon_select on public.restaurant_menu_modifier_groups;
create policy menu_modifier_groups_anon_select
  on public.restaurant_menu_modifier_groups
  for select
  to anon
  using (
    exists (
      select 1
      from public.restaurant_menu_items i
      where i.id = restaurant_menu_modifier_groups.item_id
        and i.is_available = true
    )
  );

drop policy if exists menu_modifier_groups_member_all on public.restaurant_menu_modifier_groups;
create policy menu_modifier_groups_member_all
  on public.restaurant_menu_modifier_groups
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.restaurant_menu_items i
      where i.id = restaurant_menu_modifier_groups.item_id
        and public.is_tenant_member(i.tenant_id)
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_menu_items i
      where i.id = restaurant_menu_modifier_groups.item_id
        and public.is_tenant_member(i.tenant_id)
    )
  );

commit;
