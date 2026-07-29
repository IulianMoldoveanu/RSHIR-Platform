import {
  Beef,
  Cake,
  CupSoda,
  Croissant,
  Fish,
  Flame,
  IceCreamCone,
  Leaf,
  Pizza,
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
const KEYWORD_ICONS: Array<{ icon: LucideIcon; keywords: string[] }> = [
  { icon: Pizza, keywords: ['pizza'] },
  { icon: Sandwich, keywords: ['burger', 'sandwich', 'sandvis'] },
  { icon: Soup, keywords: ['sup', 'ciorb', 'soup'] },
  { icon: Salad, keywords: ['salat', 'salad', 'vegetarian', 'vegan'] },
  { icon: Beef, keywords: ['carne', 'grill', 'gratar', 'meat', 'friptur'] },
  { icon: Fish, keywords: ['peste', 'fish', 'sushi', 'fructe de mare', 'seafood'] },
  { icon: Croissant, keywords: ['mic dejun', 'breakfast', 'brunch', 'patiserie'] },
  { icon: Wheat, keywords: ['paste', 'pasta', 'ciabatta', 'focaccia', 'paine', 'bread'] },
  { icon: CupSoda, keywords: ['baut', 'drink', 'suc', 'racoritoare', 'beverage'] },
  { icon: IceCreamCone, keywords: ['inghet', 'ice cream', 'desert'] },
  { icon: Cake, keywords: ['tort', 'prajitur', 'cake', 'dulce', 'sweet'] },
  { icon: Flame, keywords: ['picant', 'spicy', 'sos', 'sauce'] },
  { icon: Sparkles, keywords: ['nou', 'new', 'special', 'recomandat'] },
  { icon: Leaf, keywords: ['fresh', 'healthy', 'sanatos'] },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Resolves a placeholder Lucide icon for a category name by keyword match.
 *  Falls back to a generic utensils glyph when nothing matches. */
export function iconForCategory(name: string): LucideIcon {
  const n = normalize(name);
  for (const { icon, keywords } of KEYWORD_ICONS) {
    if (keywords.some((k) => n.includes(k))) return icon;
  }
  return UtensilsCrossed;
}
