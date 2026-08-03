import type { FoodIconName } from './food-icons';

// Category tiles need a glyph, but restaurant_menu_categories has no icon
// column (unlike menu items/brands, which both have image_url/logo_url) —
// this is a placeholder icon system, not real per-tenant artwork. Matches
// by keyword against the category name (diacritics-insensitive, RO/EN) so
// the tile grid has a visual identity today without a migration; a real
// icon_url upload can override this per-category later as a fast-follow.
//
// 2026-08-02 — the glyphs are our own drawings now (./food-icons), not Lucide.
// Lucide is built for 16–20px beside a label; at 28px on a tile its glyphs read
// as toolbar chrome. See the note at the top of food-icons.tsx.
//
// Vertical-scoped for now (RESTAURANT is the only vertical live — see
// tenants.vertical). When FLORIST / GROCERY ship, add their own keyword+
// palette banks alongside this one and switch on tenant.vertical at the
// call sites; iconForCategory/tileStyleForCategory's signatures don't need
// to change for that, only what table they read.
//
// Order matters: more specific keywords are listed BEFORE more generic
// ones that could otherwise shadow them (e.g. "pui la grătar" should hit
// the drumstick via "pui", not the skewer via "gratar" — checked later).
//
// Keywords are STEMS, not whole words: RO inflects heavily, so "salat" has to
// catch "Salată" and "Salate", and "vegetar" has to catch both "Vegetarian"
// and "Vegetariene" (the latter contains neither "vegetarian" nor "vegana").
const RESTAURANT_KEYWORD_ICONS: Array<{ icon: FoodIconName; keywords: string[] }> = [
  { icon: 'pizza', keywords: ['pizza'] },
  { icon: 'chicken', keywords: ['pui', 'chicken', 'aripioare', 'wings'] },
  // NOT 'ou': a two-letter stem matches inside unrelated words, and it did —
  // "Noutăți" normalises to "noutati", which contains "ou", so it took the egg
  // instead of the sparkle. Stems have to be long enough to be words.
  { icon: 'egg', keywords: ['oua', 'egg', 'omlet', 'ochiuri'] },
  { icon: 'burger', keywords: ['burger', 'sandwich', 'sandvis', 'smash', 'wrap'] },
  { icon: 'fries', keywords: ['cartof', 'fries', 'chips', 'snack', 'gustar'] },
  { icon: 'soup', keywords: ['sup', 'ciorb', 'soup'] },
  { icon: 'salad', keywords: ['salat', 'salad', 'vegetar', 'vegan'] },
  { icon: 'grill', keywords: ['carne', 'grill', 'gratar', 'meat', 'friptur', 'vita', 'porc'] },
  { icon: 'fish', keywords: ['peste', 'fish', 'sushi', 'fructe de mare', 'seafood'] },
  { icon: 'coffee', keywords: ['mic dejun', 'breakfast', 'brunch', 'patiserie', 'cafea', 'coffee'] },
  { icon: 'pasta', keywords: ['paste', 'pasta', 'ciabatta', 'focaccia', 'paine', 'bread'] },
  { icon: 'cheese', keywords: ['branz', 'cheese', 'lactate', 'iaurt'] },
  { icon: 'drink', keywords: ['baut', 'drink', 'suc', 'racoritoare', 'beverage'] },
  { icon: 'icecream', keywords: ['inghet', 'ice cream', 'desert'] },
  { icon: 'cake', keywords: ['tort', 'prajitur', 'cake', 'dulc', 'sweet'] },
  { icon: 'flame', keywords: ['picant', 'spicy', 'sos', 'sauce'] },
  { icon: 'sparkle', keywords: ['nou', 'new', 'special', 'recomandat'] },
  { icon: 'leaf', keywords: ['fresh', 'healthy', 'sanatos'] },
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
  '#EA580C', // Chicken — orange
  '#CA8A04', // Egg — yellow
  '#65A30D', // Sandwich/burger — lime
  '#DC2626', // Fries — red
  '#E11D48', // Soup — rose
  '#059669', // Salad — emerald
  '#B91C1C', // Grill / skewer — brick red
  '#0284C7', // Fish — sky
  '#92400E', // Coffee / breakfast — coffee brown
  '#A16207', // Pasta — toasted wheat
  '#2563EB', // Cheese — blue
  '#0891B2', // Drink — cyan
  '#DB2777', // Ice cream — pink
  '#C026D3', // Cake — fuchsia
  '#C2410C', // Flame — ember orange
  '#9333EA', // Sparkle — purple
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

/** Resolves a drawn glyph for a category name by keyword match. Falls back to
 *  cutlery when nothing matches. Returns the icon's *name*; render it with
 *  <FoodIcon name={...} />. */
export function iconForCategory(name: string): FoodIconName {
  const idx = matchIndex(name);
  return idx === -1 ? 'cutlery' : RESTAURANT_KEYWORD_ICONS[idx]!.icon;
}

/** The category's ink colour: the glyph stroke on an unselected tile, and the
 *  hue its card is faintly washed and outlined with. Matched by the same
 *  keyword as the icon, so a category's colour and its glyph always agree. */
export function accentForCategory(name: string): string {
  const idx = matchIndex(name);
  return idx === -1 ? FALLBACK_ACCENT : CATEGORY_ACCENTS[idx] ?? FALLBACK_ACCENT;
}

/**
 * Inactive tile: a plain white card. Identical for every category — all of the
 * colour is carried by the glyph.
 *
 * 2026-08-03. This used to be a 4% wash of the category's hue behind a hairline
 * at 28% of it. Rendered as a strip, that produced a row of *mismatched pastel
 * boxes* — cream next to mint next to pink — and the eye read the containers
 * instead of the icons. Five treatments were rendered side by side (coloured
 * border / 10% wash / white card / white with a tinted hairline / flat grey);
 * the white card was cleanest by a distance, and it's the only one that stays
 * calm no matter how many categories a tenant has or which hues they land on.
 *
 * The border is an `inset` shadow rather than a real border so the card keeps
 * its exact 64px box — a 1px border would otherwise have to be subtracted from
 * the content area, and the glyph would sit half a pixel off centre.
 */
export const INACTIVE_TILE_STYLE = {
  background: '#FFFFFF',
  boxShadow:
    'inset 0 0 0 1px rgba(15, 23, 42, 0.07), 0 1px 2px rgba(15, 23, 42, 0.06), 0 2px 6px -2px rgba(15, 23, 42, 0.05)',
} as const;

/** Kept as a function because the call sites read as a per-category lookup, and
 *  a per-category tile background is exactly what a tenant might want back. */
export function tileStyleForCategory(_name: string): typeof INACTIVE_TILE_STYLE {
  return INACTIVE_TILE_STYLE;
}

// Selected tile — filled with the tenant's own brand colour (HIR purple as the
// fallback) with a white glyph on top, the same figure/ground flip Boost Eat
// uses for the active category.
//
// Three layers, which is what separates a "coloured square" from a button that
// looks made: a tight contact shadow that anchors it to the strip, a wider
// ambient one for lift, and a 1px inner highlight along the top edge so the
// surface catches light instead of reading as flat fill.
//
// The shadows are NEUTRAL on purpose. They used to be tinted purple, which is
// only right for tenants whose brand happens to be purple — on Restaurantul
// Demo's orange-red it put a violet glow under an orange button, and every
// tenant with a warm brand would have inherited that. Tinting correctly would
// mean color-mix() on var(--hir-brand), and an unsupported color-mix()
// invalidates the whole box-shadow declaration, dropping all three layers at
// once. A neutral slate shadow is right under every hue and can't fail.
export const ACTIVE_TILE_STYLE = {
  background: 'var(--hir-brand, #7c3aed)',
  borderColor: 'transparent',
  boxShadow:
    '0 2px 4px -1px rgba(15, 23, 42, 0.22), 0 10px 20px -8px rgba(15, 23, 42, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.28)',
} as const;
