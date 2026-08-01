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
// Vertical-scoped for now (RESTAURANT is the only vertical live — see
// tenants.vertical). When FLORIST / GROCERY ship, add their own keyword+
// palette banks alongside this one and switch on tenant.vertical at the
// call sites; iconForCategory/tileStyleForCategory's signatures don't need
// to change for that, only what table they read.
//
// Order matters: more specific keywords are listed BEFORE more generic
// ones that could otherwise shadow them (e.g. "pui la grătar" should hit
// Drumstick via "pui", not Beef via "grătar" — grătar is checked later).
const RESTAURANT_KEYWORD_ICONS: Array<{ icon: LucideIcon; keywords: string[] }> = [
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

// Duotone gradient stops per RESTAURANT_KEYWORD_ICONS entry (same index) —
// each category gets its own identity instead of a shared flat pastel, so
// the tile strip reads as designed rather than templated. Picked from
// Tailwind's 500-900 range (reliable ≥3:1 contrast for a white icon glyph
// at any point in the gradient, not just the darker stop) and spread across
// the hue wheel so neighbouring tiles stay visually distinct even when two
// categories land in the same broad family (e.g. Croissant's coffee-brown
// amber-700→900 vs Pizza's brighter amber-500→700).
const TILE_GRADIENTS: ReadonlyArray<readonly [from: string, to: string]> = [
  ['#F59E0B', '#B45309'], // Pizza — amber
  ['#F97316', '#C2410C'], // Drumstick (pui) — orange
  ['#EAB308', '#A16207'], // Egg — yellow
  ['#84CC16', '#4D7C0F'], // Sandwich/burger — lime
  ['#EF4444', '#B91C1C'], // Popcorn (cartofi/gustări) — red
  ['#F43F5E', '#BE123C'], // Soup — rose
  ['#10B981', '#047857'], // Salad — emerald
  ['#DC2626', '#7F1D1D'], // Beef — brick red
  ['#0EA5E9', '#0369A1'], // Fish — sky
  ['#B45309', '#78350F'], // Croissant — coffee brown
  ['#CA8A04', '#713F12'], // Wheat — toasted wheat
  ['#3B82F6', '#1D4ED8'], // Milk — blue
  ['#06B6D4', '#0E7490'], // CupSoda — cyan
  ['#EC4899', '#BE185D'], // IceCreamCone — pink
  ['#D946EF', '#A21CAF'], // Cake — fuchsia
  ['#EA580C', '#9A3412'], // Flame — ember orange
  ['#A855F7', '#7E22CE'], // Sparkles — purple
  ['#22C55E', '#15803D'], // Leaf — green
];
const FALLBACK_GRADIENT: readonly [string, string] = ['#A1A1AA', '#52525B']; // zinc

/** A diagonal duotone with a soft top-left highlight baked into the same
 *  `background` value — one element gets both a color identity and a hint
 *  of dimensionality, no extra DOM node for the highlight layer. */
function gradientBackground([from, to]: readonly [string, string]): string {
  return `radial-gradient(circle at 30% 22%, rgba(255,255,255,0.45), transparent 45%), linear-gradient(135deg, ${from}, ${to})`;
}

/** Soft ambient shadow in the gradient's own hue, so the tile reads as
 *  lifted rather than flat-printed on the page. */
function gradientShadow([, to]: readonly [string, string]): string {
  return `0 8px 20px -8px ${to}80`;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function matchIndex(name: string): number {
  const n = normalize(name);
  return RESTAURANT_KEYWORD_ICONS.findIndex(({ keywords }) => keywords.some((k) => n.includes(k)));
}

/** Resolves a placeholder Lucide icon for a category name by keyword match.
 *  Falls back to a generic utensils glyph when nothing matches. */
export function iconForCategory(name: string): LucideIcon {
  const idx = matchIndex(name);
  return idx === -1 ? UtensilsCrossed : RESTAURANT_KEYWORD_ICONS[idx]!.icon;
}

export type CategoryTileStyle = {
  /** CSS `background` value — a duotone gradient with a baked-in highlight. */
  background: string;
  /** CSS `boxShadow` value — a soft shadow tinted to the tile's own hue. */
  boxShadow: string;
};

/** Resolves the inactive-state tile style (gradient + ambient shadow) for a
 *  category, matched to the same keyword as its icon so each category tile
 *  reads as individually designed rather than templated. */
export function tileStyleForCategory(name: string): CategoryTileStyle {
  const idx = matchIndex(name);
  const pair = idx === -1 ? FALLBACK_GRADIENT : TILE_GRADIENTS[idx] ?? FALLBACK_GRADIENT;
  return { background: gradientBackground(pair), boxShadow: gradientShadow(pair) };
}

// Active-state tile style — same glossy-highlight treatment as the inactive
// gradients, over the tenant's own brand color (falling back to HIR's
// default purple) so the selected tile still feels designed, not just
// "brand color, flat." Fixed to the fallback purple's own glow rather than
// computed from the CSS var: mixing a CSS custom property into an rgba()
// string needs color-mix(), which is newer than this codebase wants to
// depend on for a decorative shadow.
export const ACTIVE_TILE_STYLE: CategoryTileStyle = {
  background:
    'radial-gradient(circle at 30% 22%, rgba(255,255,255,0.35), transparent 45%), var(--hir-brand, #7c3aed)',
  boxShadow: '0 8px 20px -6px rgba(124, 58, 237, 0.45)',
};
