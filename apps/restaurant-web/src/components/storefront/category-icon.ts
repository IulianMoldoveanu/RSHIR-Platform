import {
  Beef,
  Cake,
  CupSoda,
  Croissant,
  Drumstick,
  Egg,
  Fish,
  Flame,
  IceCreamCone,
  Leaf,
  Milk,
  Pizza,
  Popcorn,
  Salad,
  Sandwich,
  Soup,
  Sparkles,
  UtensilsCrossed,
  Wheat,
  type LucideIcon,
} from 'lucide-react';

// Category tiles need a glyph, but restaurant_menu_categories has no icon
// column (unlike menu items/brands, which both have image_url/logo_url) —
// this is a placeholder icon system, not real per-tenant artwork. Matches
// by keyword against the category name (diacritics-insensitive, RO/EN) so
// the tile grid has a visual identity today without a migration; a real
// icon_url upload can override this per-category later as a fast-follow.
//
// Order matters: more specific keywords are listed BEFORE more generic
// ones that could otherwise shadow them (e.g. "pui la grătar" should hit
// Drumstick via "pui", not Beef via "grătar" — grătar is checked later).
const KEYWORD_ICONS: Array<{ icon: LucideIcon; keywords: string[] }> = [
  { icon: Pizza, keywords: ['pizza'] },
  { icon: Drumstick, keywords: ['pui', 'chicken', 'aripioare', 'wings'] },
  { icon: Egg, keywords: ['ou', 'oua', 'egg', 'omleta', 'omlet'] },
  { icon: Sandwich, keywords: ['burger', 'sandwich', 'sandvis', 'smash', 'wrap'] },
  { icon: Popcorn, keywords: ['cartof', 'fries', 'chips', 'snack', 'gustar'] },
  { icon: Soup, keywords: ['sup', 'ciorb', 'soup'] },
  { icon: Salad, keywords: ['salat', 'salad', 'vegetarian', 'vegan'] },
  { icon: Beef, keywords: ['carne', 'grill', 'gratar', 'meat', 'friptur', 'vita', 'porc'] },
  { icon: Fish, keywords: ['peste', 'fish', 'sushi', 'fructe de mare', 'seafood'] },
  { icon: Croissant, keywords: ['mic dejun', 'breakfast', 'brunch', 'patiserie'] },
  { icon: Wheat, keywords: ['paste', 'pasta', 'ciabatta', 'focaccia', 'paine', 'bread'] },
  { icon: Milk, keywords: ['branz', 'cheese', 'lactate', 'iaurt'] },
  { icon: CupSoda, keywords: ['baut', 'drink', 'suc', 'racoritoare', 'beverage'] },
  { icon: IceCreamCone, keywords: ['inghet', 'ice cream', 'desert'] },
  { icon: Cake, keywords: ['tort', 'prajitur', 'cake', 'dulce', 'sweet'] },
  { icon: Flame, keywords: ['picant', 'spicy', 'sos', 'sauce'] },
  { icon: Sparkles, keywords: ['nou', 'new', 'special', 'recomandat'] },
  { icon: Leaf, keywords: ['fresh', 'healthy', 'sanatos'] },
];

// Pastel background per KEYWORD_ICONS entry (same index), applied to the
// INACTIVE tile state so categories read as visually distinct from each
// other at a glance — not just differently-labeled gray buttons. The
// active tile still overrides to the tenant's brand color (category-
// tabs.tsx), so this only matters for everything you're not currently on.
const TILE_BG_CLASSES = [
  'bg-amber-50 text-amber-600', // Pizza
  'bg-orange-50 text-orange-600', // Drumstick (pui)
  'bg-yellow-50 text-yellow-700', // Egg
  'bg-lime-50 text-lime-700', // Sandwich/burger
  'bg-red-50 text-red-600', // Popcorn (cartofi/gustări)
  'bg-rose-50 text-rose-600', // Soup
  'bg-emerald-50 text-emerald-600', // Salad
  'bg-red-50 text-red-700', // Beef
  'bg-sky-50 text-sky-600', // Fish
  'bg-amber-50 text-amber-700', // Croissant
  'bg-yellow-50 text-yellow-800', // Wheat
  'bg-blue-50 text-blue-600', // Milk
  'bg-cyan-50 text-cyan-600', // CupSoda
  'bg-pink-50 text-pink-500', // IceCreamCone
  'bg-fuchsia-50 text-fuchsia-600', // Cake
  'bg-red-50 text-red-500', // Flame
  'bg-purple-50 text-purple-600', // Sparkles
  'bg-green-50 text-green-600', // Leaf
] as const;
const FALLBACK_TILE_BG = 'bg-zinc-100 text-zinc-500';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function matchIndex(name: string): number {
  const n = normalize(name);
  return KEYWORD_ICONS.findIndex(({ keywords }) => keywords.some((k) => n.includes(k)));
}

/** Resolves a placeholder Lucide icon for a category name by keyword match.
 *  Falls back to a generic utensils glyph when nothing matches. */
export function iconForCategory(name: string): LucideIcon {
  const idx = matchIndex(name);
  return idx === -1 ? UtensilsCrossed : KEYWORD_ICONS[idx]!.icon;
}

/** Resolves a pastel `bg-* text-*` class pair for a category's inactive
 *  tile background, matched to the same keyword as its icon so each
 *  category tile reads as visually distinct at a glance. */
export function tileColorForCategory(name: string): string {
  const idx = matchIndex(name);
  return idx === -1 ? FALLBACK_TILE_BG : TILE_BG_CLASSES[idx] ?? FALLBACK_TILE_BG;
}
