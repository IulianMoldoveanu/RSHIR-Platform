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
  cat_pizza uuid;
  cat_paste uuid;
  cat_drinks uuid;
  order_refs int;
begin
  select id into t_id from public.tenants where slug = 'restaurant-demo';

  -- Guard: if this tenant ever did accumulate real orders, bail out rather
  -- than delete menu rows those orders might reference.
  select count(*) into order_refs from public.restaurant_orders where tenant_id = t_id;
  if order_refs > 0 then
    raise notice 'restaurant-demo has % order(s) — skipping menu reset to avoid touching referenced rows', order_refs;
    return;
  end if;

  delete from public.restaurant_menu_items where tenant_id = t_id;
  delete from public.restaurant_menu_categories where tenant_id = t_id;

  insert into public.restaurant_menu_categories (tenant_id, name, sort_order)
  values
    (t_id, 'Pizza',     0),
    (t_id, 'Paste',     1),
    (t_id, 'Băuturi',   2);

  select id into cat_pizza  from public.restaurant_menu_categories where tenant_id = t_id and name = 'Pizza'   limit 1;
  select id into cat_paste  from public.restaurant_menu_categories where tenant_id = t_id and name = 'Paste'   limit 1;
  select id into cat_drinks from public.restaurant_menu_categories where tenant_id = t_id and name = 'Băuturi' limit 1;

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

  -- Băuturi
  insert into public.restaurant_menu_items (tenant_id, category_id, name, description, price_ron, sort_order, is_available, image_url, allergens)
  values
    (t_id, cat_drinks, 'Limonadă casei',  'Lămâie, mentă, miere', 14.00, 0, true, 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=400&h=400&fit=crop&q=80', '{}'),
    (t_id, cat_drinks, 'Apă plată 500ml', null,                    6.00, 1, true, 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&h=400&fit=crop&q=80', '{}');
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
