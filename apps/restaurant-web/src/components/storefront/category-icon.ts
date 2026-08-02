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

// One ink colour per RESTAURANT_KEYWORD_ICONS entry (same index).
//
// 2026-08-02 — these used to be full duotone gradients filling the whole tile
// with a white glyph on top. Iulian rejected that look outright ("butoanele
// inca nu arata la un nivel profesional ... sa aiba un design artistic si
// placut la vedere") against Boost Eat's category row, which is white cards
// with a drawn line-art glyph. Saturated gradient blobs read as templated UI
// chrome; a monoline glyph on white reads as illustration.
//
// So the colour is now carried by the *glyph*, not by a filled background:
// each category keeps its own identity, but the strip stays calm and the
// icons stay legible at 28px. Values are Tailwind's 600 range, dark enough
// for ≥4.5:1 on white.
const CATEGORY_ACCENTS: ReadonlyArray<string> = [
  '#D97706', // Pizza — amber
  '#EA580C', // Drumstick (pui) — orange
  '#CA8A04', // Egg — yellow
  '#65A30D', // Sandwich/burger — lime
  '#DC2626', // Popcorn (cartofi/gustări) — red
  '#E11D48', // Soup — rose
  '#059669', // Salad — emerald
  '#B91C1C', // Beef — brick red
  '#0284C7', // Fish — sky
  '#92400E', // Croissant — coffee brown
  '#A16207', // Wheat — toasted wheat
  '#2563EB', // Milk — blue
  '#0891B2', // CupSoda — cyan
  '#DB2777', // IceCreamCone — pink
  '#C026D3', // Cake — fuchsia
  '#C2410C', // Flame — ember orange
  '#9333EA', // Sparkles — purple
  '#16A34A', // Leaf — green
];
const FALLBACK_ACCENT = '#52525B'; // zinc-600

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

/** The category's ink colour: the glyph stroke on an unselected tile, and the
 *  hue its card is faintly washed and outlined with. Matched by the same
 *  keyword as the icon, so a category's colour and its glyph always agree. */
export function accentForCategory(name: string): string {
  const idx = matchIndex(name);
  return idx === -1 ? FALLBACK_ACCENT : CATEGORY_ACCENTS[idx] ?? FALLBACK_ACCENT;
}

/** Inactive tile: a white card washed with ~4% of the category's own hue and
 *  outlined in ~28% of it. Enough for the strip to look composed rather than
 *  monochrome, far short of a filled colour block. */
export function tileStyleForCategory(name: string): {
  background: string;
  borderColor: string;
} {
  const accent = accentForCategory(name);
  return { background: `${accent}0A`, borderColor: `${accent}47` };
}

// Selected tile — filled with the tenant's own brand colour (HIR purple as the
// fallback) with a white glyph on top, the same figure/ground flip Boost Eat
// uses for the active category. Shadow is pinned to the fallback purple rather
// than computed from the CSS var: mixing a custom property into rgba() needs
// color-mix(), newer than this codebase wants to depend on for decoration.
export const ACTIVE_TILE_STYLE = {
  background: 'var(--hir-brand, #7c3aed)',
  borderColor: 'transparent',
  boxShadow: '0 10px 22px -10px rgba(124, 58, 237, 0.55)',
} as const;
