-- Per-item display extras: prep time + serving size for the storefront card
-- and detail sheet. All optional; legacy items keep behaviour by leaving
-- everything NULL.
--
-- prep_minutes: minutes from order acceptance to ready-for-pickup. Renders
--   as "Gata în X min" badge on item cards. 0–240 (4h cap is generous; longer
--   prep times are typically catering and out of scope for a delivery menu).
-- serving_size_grams: integer grams. Drives the per-100g price under the
--   item price ("350g · 12.86 RON / 100g") so customers can compare across
--   sizes. 0 < g < 5000.
-- serving_size_label: free-text override (max 60 chars) for non-mass units —
--   e.g. "1 porție 2 persoane", "350ml", "set 8 piese". When set, it takes
--   priority over the gram-based label rendered from serving_size_grams.

alter table public.restaurant_menu_items
  add column if not exists prep_minutes int check (prep_minutes is null or (prep_minutes >= 0 and prep_minutes <= 240)),
  add column if not exists serving_size_grams int check (serving_size_grams is null or (serving_size_grams > 0 and serving_size_grams < 5000)),
  add column if not exists serving_size_label text check (serving_size_label is null or char_length(serving_size_label) <= 60);
