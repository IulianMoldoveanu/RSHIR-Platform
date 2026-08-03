import type { CSSProperties } from 'react';
import {
  ACTIVE_TILE_STYLE,
  accentForCategory,
  iconForCategory,
  tileStyleForCategory,
} from './category-icon';
import { FoodIcon } from './food-icons';

// One category tile: the card, the glyph on it, and the label under it.
//
// Extracted 2026-08-03. The real storefront (category-tabs.tsx) and the
// marketing demo (demo-storefront/_components/demo-menu.tsx) had each grown
// their own copy of this markup, and they had already drifted — the demo never
// got the hover fix that shipped for the real strip. A visitor comparing the
// two is the whole point of the demo, so they have to be the same thing.
//
// Presentational only, no state: the two strips keep their own scroll-spy and
// their own motion treatment (framer-motion on the real one, plain CSS on the
// demo), which is where they legitimately differ.

export const CATEGORY_TILE_WIDTH = 'w-[72px]';

/** Height of two lines of the label, so every tile in a strip has the same
 *  footprint whether its name wraps or not. Without it a strip mixing "Pizza"
 *  with "Preparate Vegetariene" has a ragged bottom edge. */
const LABEL_BLOCK = 'min-h-[26px]';

export function CategoryTileVisual({
  name,
  active,
  glyphClassName = 'h-[34px] w-[34px]',
}: {
  name: string;
  active: boolean;
  glyphClassName?: string;
}) {
  const style: CSSProperties = active ? ACTIVE_TILE_STYLE : tileStyleForCategory(name);
  return (
    <>
      <span
        aria-hidden
        className="absolute inset-0 rounded-[22px] transition-shadow duration-200 ease-out"
        style={style}
      />
      <FoodIcon
        name={iconForCategory(name)}
        className={`relative ${glyphClassName} transition-colors duration-200`}
        style={{ color: active ? '#FFFFFF' : accentForCategory(name) }}
      />
    </>
  );
}

export function CategoryTileLabel({ name, active }: { name: string; active: boolean }) {
  return (
    <span
      className={`line-clamp-2 ${LABEL_BLOCK} text-center text-[11px] leading-tight transition-colors ${
        active ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-600'
      }`}
    >
      {name}
    </span>
  );
}

/** The 64px card box. Owns the hover lift, so the card and its glyph move
 *  together — putting the transform on the absolutely-positioned background
 *  instead slides the card out from under a stationary glyph. */
export const CATEGORY_TILE_BOX =
  'relative flex h-16 w-16 items-center justify-center rounded-[22px] transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-active:translate-y-0';

/** Focus ring lives on the button, drawn outside the card so it reads on both
 *  the white inactive tile and the brand-filled active one. */
export const CATEGORY_TILE_BUTTON =
  `group flex ${CATEGORY_TILE_WIDTH} shrink-0 flex-col items-center gap-1.5 rounded-2xl ` +
  'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-[var(--hir-brand,#7c3aed)]';
