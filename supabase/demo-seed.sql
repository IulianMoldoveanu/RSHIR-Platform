-- HIR Restaurant Suite — one-shot demo bootstrap
--
-- Run this in Supabase SQL Editor (project qfmeojeipncuxeltnvab) AFTER
-- supabase/seed-admin.mjs has created the admin@hir.local auth user.
-- Idempotent: safe to re-run.
--
-- What it does:
--   1. Creates / refreshes the "restaurant-demo" tenant (name, status,
--      Brașov city in settings).
--   2. Adds 3 categories (Pizza / Paste / Băuturi) with 8 menu items.
--   3. Grants the seed admin (admin@hir.local) OWNER role on this tenant
--      AND on belvedere so all 3 demo tenants are visible in the dashboard
--      switcher.
--
-- After running:
--   • Log in to admin with admin@hir.local / RSHIRdev2026
--   • Switch tenants from the top-right selector
--   • Visit storefront via ?tenant=restaurant-demo on a Vercel preview URL

begin;

-- 1. Tenant
insert into public.tenants (slug, name, vertical, status, settings)
values (
  'restaurant-demo',
  'Restaurantul Demo',
  'RESTAURANT',
  'ACTIVE',
  '{"city":"Brașov","contact_email":"demo@example.com","pickup_enabled":true,"cod_enabled":true}'::jsonb
)
on conflict (slug) do update set
  name = excluded.name,
  status = excluded.status,
  settings = excluded.settings;

-- 2. Categories + items
do $$
declare
  t_id uuid;
  cat_pizza uuid;
  cat_paste uuid;
  cat_drinks uuid;
begin
  select id into t_id from public.tenants where slug = 'restaurant-demo';

  insert into public.restaurant_menu_categories (tenant_id, name, sort_order)
  values
    (t_id, 'Pizza',     0),
    (t_id, 'Paste',     1),
    (t_id, 'Băuturi',   2)
  on conflict do nothing;

  select id into cat_pizza  from public.restaurant_menu_categories where tenant_id = t_id and name = 'Pizza'   limit 1;
  select id into cat_paste  from public.restaurant_menu_categories where tenant_id = t_id and name = 'Paste'   limit 1;
  select id into cat_drinks from public.restaurant_menu_categories where tenant_id = t_id and name = 'Băuturi' limit 1;

  -- Pizza
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available)
  values
    (t_id, cat_pizza, 'Margherita',       'Sos roșii, mozzarella fior di latte, busuioc proaspăt',          32.00, 0, true),
    (t_id, cat_pizza, 'Quattro Formaggi', 'Mozzarella, gorgonzola, parmezan, brie',                          42.00, 1, true),
    (t_id, cat_pizza, 'Diavola',          'Salam picant Calabria, mozzarella, ardei iute',                   38.00, 2, true)
  on conflict do nothing;

  -- Paste
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available)
  values
    (t_id, cat_paste, 'Carbonara',         'Pancetta, gălbenuș, parmezan, piper negru',  36.00, 0, true),
    (t_id, cat_paste, 'Pesto Genovese',    'Busuioc proaspăt, pin, parmezan, ulei extravirgin', 34.00, 1, true),
    (t_id, cat_paste, 'Arrabbiata',        'Sos roșii picant, usturoi, ardei iute',      30.00, 2, true)
  on conflict do nothing;

  -- Băuturi
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available)
  values
    (t_id, cat_drinks, 'Limonadă casei',   'Lămâie, mentă, miere',  14.00, 0, true),
    (t_id, cat_drinks, 'Apă plată 500ml',  null,                     6.00, 1, true)
  on conflict do nothing;
end;
$$;

-- 3. Grant OWNER membership to admin@hir.local on restaurant-demo + belvedere
--    (the existing seed-admin.mjs only covers tenant1 + tenant2).
do $$
declare
  admin_id uuid;
begin
  select id into admin_id from auth.users where email = 'admin@hir.local';
  if admin_id is null then
    raise notice 'admin@hir.local not found in auth.users — run supabase/seed-admin.mjs first';
    return;
  end if;

  insert into public.tenant_members (tenant_id, user_id, role)
  select t.id, admin_id, 'OWNER'
  from public.tenants t
  where t.slug in ('restaurant-demo', 'belvedere', 'tenant1', 'tenant2')
  on conflict (tenant_id, user_id) do update set role = excluded.role;
end;
$$;

commit;

-- Verify (run as a separate query):
--   select t.slug, t.name, tm.role, u.email
--   from public.tenants t
--   join public.tenant_members tm on tm.tenant_id = t.id
--   join auth.users u on u.id = tm.user_id
--   where u.email = 'admin@hir.local'
--   order by t.slug;
