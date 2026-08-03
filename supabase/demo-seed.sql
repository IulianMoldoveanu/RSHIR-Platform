-- HIR Restaurant Suite — one-shot demo bootstrap
--
-- Run this in Supabase SQL Editor (project qfmeojeipncuxeltnvab) AFTER
-- supabase/seed-admin.mjs has created the admin@hir.local auth user.
-- Idempotent: safe to re-run.
--
-- What it does:
--   1. Creates / refreshes the "restaurant-demo" tenant (name, status,
--      Brașov city in settings, branding logo + cover).
--   2. Adds 3 categories (Pizza / Paste / Băuturi) with 8 menu items,
--      each with a photo.
--   3. Grants the seed admin (admin@hir.local) OWNER role on this tenant
--      AND on belvedere so all 3 demo tenants are visible in the dashboard
--      switcher.
--
-- After running:
--   • Log in to admin with admin@hir.local / RSHIRdev2026
--   • Switch tenants from the top-right selector
--   • Visit the storefront at /demo-storefront on any host (this tenant backs
--     the public interactive demo linked from the marketing site), or via
--     ?tenant=restaurant-demo on a Vercel preview URL

begin;

-- 1. Tenant
--
-- Imagery: Unsplash CDN URLs (free licence, hotlinking permitted). This is a
-- demo tenant that exists purely to be shown off from the marketing site, so
-- pointing at a public CDN is deliberate — it keeps the seed self-contained
-- with zero binary assets to upload or maintain. Real tenants upload their
-- own branding through the admin app into Supabase storage instead.
insert into public.tenants (slug, name, vertical, status, settings)
values (
  'restaurant-demo',
  'Restaurantul Demo',
  'RESTAURANT',
  'ACTIVE',
  '{
    "city": "Brașov",
    "contact_email": "demo@example.com",
    "pickup_enabled": true,
    "cod_enabled": true,
    "is_accepting_orders": false,
    "tagline": "Pizza & paste, gătite la comandă",
    "delivery_eta_min_minutes": 25,
    "delivery_eta_max_minutes": 40,
    "branding": {
      "logo_url": "https://images.unsplash.com/photo-1590947132387-155cc02f3212?w=200&h=200&fit=crop&q=80",
      "cover_url": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&h=400&fit=crop&q=80",
      "brand_color": "#C2410C"
    }
  }'::jsonb
)
on conflict (slug) do update set
  name = excluded.name,
  status = excluded.status,
  settings = excluded.settings;

-- 2. Categories + items
--
-- Replace-in-place rather than upsert. There is NO unique constraint on
-- (tenant_id, name) for either table, so the `on conflict do nothing` this
-- block used to rely on never actually deduplicated anything — re-running the
-- seed silently doubled every category and every item (observed on prod
-- 2026-08-01: 16 items / 6 categories instead of 8 / 3, rendering the demo
-- menu with everything listed twice). Deleting this tenant's menu first is
-- safe and makes the seed genuinely idempotent: `restaurant-demo` is a
-- throwaway fixture that backs the public /demo-storefront page and never
-- carries real orders (the demo checkout is a client-side simulation that
-- writes nothing).
do $$
declare
  t_id uuid;
  cat_breakfast uuid;
  cat_pizza uuid;
  cat_paste uuid;
  cat_burger uuid;
  cat_grill uuid;
  cat_salate uuid;
  cat_supe uuid;
  cat_desert uuid;
  cat_drinks uuid;
  order_refs int;
begin
  select id into t_id from public.tenants where slug = 'restaurant-demo';

  -- 2026-08-03 — this used to bail out entirely when the tenant had any orders,
  -- on the assumption that orders reference menu rows. They don't:
  -- `restaurant_orders` snapshots its line items into a jsonb column, and
  -- information_schema shows no foreign key from orders to
  -- restaurant_menu_items (only modifiers, menu_events and recipes point
  -- there, and those are deleted with the items). So a menu reset here cannot
  -- orphan an order.
  --
  -- The guard mattered: two fictional orders were seeded on 2026-08-01 to make
  -- the admin dashboard screenshots non-empty, and they silently blocked every
  -- re-seed after that — the menu simply stopped changing, with no error. Kept
  -- as a notice so the situation is still visible in the log.
  --
  -- Note this whole block is hardcoded to slug = 'restaurant-demo', a throwaway
  -- fixture behind the public /demo-storefront page. It can never touch a real
  -- tenant's menu.
  select count(*) into order_refs from public.restaurant_orders where tenant_id = t_id;
  if order_refs > 0 then
    raise notice 'restaurant-demo has % order(s); menu reset proceeds (orders snapshot their line items)', order_refs;
  end if;

  delete from public.restaurant_menu_items where tenant_id = t_id;
  delete from public.restaurant_menu_categories where tenant_id = t_id;

  -- 2026-08-03 — grown from 3 categories to 9. Three tiles left most of the
  -- strip empty, which made the demo look like a test fixture rather than a
  -- restaurant (Iulian: "ar fi bine sa apara mai multe butoane si categorii, sa
  -- arate mai profi"). Nine also gives the strip something to scroll, which is
  -- the interaction a prospect is meant to notice, and it exercises nine
  -- different glyphs instead of three.
  insert into public.restaurant_menu_categories (tenant_id, name, sort_order)
  values
    (t_id, 'Mic dejun', 0),
    (t_id, 'Pizza',     1),
    (t_id, 'Paste',     2),
    (t_id, 'Burgeri',   3),
    (t_id, 'Grătar',    4),
    (t_id, 'Salate',    5),
    (t_id, 'Supe',      6),
    (t_id, 'Deserturi', 7),
    (t_id, 'Băuturi',   8);

  select id into cat_breakfast from public.restaurant_menu_categories where tenant_id = t_id and name = 'Mic dejun' limit 1;
  select id into cat_pizza     from public.restaurant_menu_categories where tenant_id = t_id and name = 'Pizza'     limit 1;
  select id into cat_paste     from public.restaurant_menu_categories where tenant_id = t_id and name = 'Paste'     limit 1;
  select id into cat_burger    from public.restaurant_menu_categories where tenant_id = t_id and name = 'Burgeri'   limit 1;
  select id into cat_grill     from public.restaurant_menu_categories where tenant_id = t_id and name = 'Grătar'    limit 1;
  select id into cat_salate    from public.restaurant_menu_categories where tenant_id = t_id and name = 'Salate'    limit 1;
  select id into cat_supe      from public.restaurant_menu_categories where tenant_id = t_id and name = 'Supe'      limit 1;
  select id into cat_desert    from public.restaurant_menu_categories where tenant_id = t_id and name = 'Deserturi' limit 1;
  select id into cat_drinks    from public.restaurant_menu_categories where tenant_id = t_id and name = 'Băuturi'   limit 1;

  -- Mic dejun
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available, image_url, allergens)
  values
    (t_id, cat_breakfast, 'Ouă Benedict',   'Ou poșat, șuncă de Praga, sos olandez, muffin englezesc', 28.00, 0, true, 'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?w=400&h=400&fit=crop&q=80', array['gluten','oua','lapte']),
    (t_id, cat_breakfast, 'Pancakes cu fructe', 'Clătite pufoase, fructe de pădure, sirop de arțar',   24.00, 1, true, 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=400&fit=crop&q=80', array['gluten','oua','lapte']),
    (t_id, cat_breakfast, 'Avocado toast',  'Pâine cu maia, avocado, ou ochi, semințe',                26.00, 2, true, 'https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?w=400&h=400&fit=crop&q=80', array['gluten','oua','susan']);

  -- Pizza
  -- allergens: Reg. (UE) 1169/2011 Anexa II. Codurile sunt cele din
  -- packages/ui/lib/allergens.ts. Demo-ul e vitrina produsului, deci trebuie
  -- sa arate cum arata un meniu declarat corect, nu unul gol.
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available, image_url, allergens)
  values
    (t_id, cat_pizza, 'Margherita',       'Sos roșii, mozzarella fior di latte, busuioc proaspăt', 32.00, 0, true, 'https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?w=400&h=400&fit=crop&q=80', array['gluten','lapte']),
    (t_id, cat_pizza, 'Quattro Formaggi', 'Mozzarella, gorgonzola, parmezan, brie',                42.00, 1, true, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=400&fit=crop&q=80', array['gluten','lapte']),
    (t_id, cat_pizza, 'Diavola',          'Salam picant Calabria, mozzarella, ardei iute',         38.00, 2, true, 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400&h=400&fit=crop&q=80', array['gluten','lapte']);

  -- Paste
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available, image_url, allergens)
  values
    (t_id, cat_paste, 'Carbonara',      'Pancetta, gălbenuș, parmezan, piper negru',         36.00, 0, true, 'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=400&h=400&fit=crop&q=80', array['gluten','oua','lapte']),
    (t_id, cat_paste, 'Pesto Genovese', 'Busuioc proaspăt, pin, parmezan, ulei extravirgin', 34.00, 1, true, 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=400&h=400&fit=crop&q=80', array['gluten','lapte','nuci']),
    (t_id, cat_paste, 'Arrabbiata',     'Sos roșii picant, usturoi, ardei iute',             30.00, 2, true, 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&h=400&fit=crop&q=80', array['gluten']);

  -- Burgeri
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available, image_url, allergens)
  values
    (t_id, cat_burger, 'Smash Burger',    'Două chiftele de vită, cheddar, castraveți murați, sos casei', 39.00, 0, true, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop&q=80', array['gluten','lapte','oua','mustar','susan']),
    (t_id, cat_burger, 'Crispy Chicken',  'Piept de pui pané, salată iceberg, maioneză cu usturoi',       36.00, 1, true, 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=400&h=400&fit=crop&q=80', array['gluten','oua','mustar']),
    (t_id, cat_burger, 'Veggie Burger',   'Chiftea de năut, hummus, roșii, rucola',                       33.00, 2, true, 'https://images.unsplash.com/photo-1520072959219-c595dc870360?w=400&h=400&fit=crop&q=80', array['gluten','susan']);

  -- Grătar
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available, image_url, allergens)
  values
    (t_id, cat_grill, 'Ceafă de porc',    'Marinată în ierburi, cartofi noi, mujdei',        46.00, 0, true, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop&q=80', '{}'),
    (t_id, cat_grill, 'Frigărui de pui',  'Pui marinat, ardei, ceapă roșie, sos tzatziki',   42.00, 1, true, 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400&h=400&fit=crop&q=80', array['lapte']),
    (t_id, cat_grill, 'Somon la grătar',  'File de somon, unt cu lămâie, legume la abur',    58.00, 2, true, 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&h=400&fit=crop&q=80', array['peste','lapte']);

  -- Salate
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available, image_url, allergens)
  values
    (t_id, cat_salate, 'Caesar cu pui',   'Salată romană, crutoane, parmezan, dressing Caesar', 34.00, 0, true, 'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?w=400&h=400&fit=crop&q=80', array['gluten','oua','lapte','peste']),
    (t_id, cat_salate, 'Grecească',       'Roșii, castraveți, măsline Kalamata, feta, oregano',  28.00, 1, true, 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&h=400&fit=crop&q=80', array['lapte']),
    (t_id, cat_salate, 'Quinoa & avocado','Quinoa, avocado, edamame, semințe de dovleac',        32.00, 2, true, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=400&fit=crop&q=80', array['soia']);

  -- Supe
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available, image_url, allergens)
  values
    (t_id, cat_supe, 'Ciorbă de burtă',   'Servită cu smântână și ardei iute', 24.00, 0, true, 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=400&fit=crop&q=80', array['lapte','telina','oua']),
    (t_id, cat_supe, 'Supă cremă de linte','Linte roșie, morcov, chimion, ulei de măsline', 22.00, 1, true, 'https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?w=400&h=400&fit=crop&q=80', array['telina']),
    (t_id, cat_supe, 'Supă de pui',       'Tăiței de casă, legume rădăcinoase',  22.00, 2, true, 'https://images.unsplash.com/photo-1603105037880-880cd4edfb0d?w=400&h=400&fit=crop&q=80', array['gluten','oua','telina']);

  -- Deserturi
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available, image_url, allergens)
  values
    (t_id, cat_desert, 'Tiramisu',        'Mascarpone, cafea espresso, cacao',        22.00, 0, true, 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400&h=400&fit=crop&q=80', array['gluten','oua','lapte']),
    (t_id, cat_desert, 'Papanași',        'Smântână și dulceață de afine',            26.00, 1, true, 'https://images.unsplash.com/photo-1519676867240-f03562e64548?w=400&h=400&fit=crop&q=80', array['gluten','oua','lapte']),
    (t_id, cat_desert, 'Înghețată artizanală', 'Trei cupe la alegere',                18.00, 2, true, 'https://images.unsplash.com/photo-1567206563064-6f60f40a2b57?w=400&h=400&fit=crop&q=80', array['lapte']);

  -- Băuturi
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available, image_url, allergens)
  values
    (t_id, cat_drinks, 'Limonadă casei',  'Lămâie, mentă, miere', 14.00, 0, true, 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=400&h=400&fit=crop&q=80', '{}'),
    (t_id, cat_drinks, 'Apă plată 500ml', null,                    6.00, 1, true, 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&h=400&fit=crop&q=80', '{}'),
    (t_id, cat_drinks, 'Cafea espresso',  'Boabe 100% arabica',    9.00, 2, true, 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=400&h=400&fit=crop&q=80', '{}');
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
