-- Allergen declaration per menu item.
--
-- Regulamentul (UE) 1169/2011 art. 14 + Anexa II: for food sold at a distance,
-- the mandatory information — allergens included — must reach the consumer
-- before the purchase is concluded. An online menu with no allergen field
-- cannot satisfy that, which is what this column fixes.
--
-- Codes are the fixed 14 from Anexa II (see packages/ui/lib/allergens.ts).
-- Deliberately a plain text[] rather than an enum: the catalogue is validated
-- in application code on both write and read, and an enum would make the one
-- historical change to this list (sesame's scope) a migration on a hot table.
--
-- Empty array means "none declared", which is NOT the same as "contains no
-- allergens" — the storefront renders nothing at all in that case rather than
-- claiming the dish is allergen-free.

alter table public.restaurant_menu_items
  add column if not exists allergens text[] not null default '{}'::text[];

comment on column public.restaurant_menu_items.allergens is
  'EU 1169/2011 Annex II allergen codes declared for this item. Catalogue + validation: packages/ui/lib/allergens.ts. Empty = not declared, not "allergen-free".';
