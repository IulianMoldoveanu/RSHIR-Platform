// Hand-drawn monoline food icons for the category tiles.
//
// 2026-08-02 — replaces Lucide. Lucide is a *UI* icon set: its glyphs are built
// to sit at 16–20px next to a label, so they carry only as much detail as
// survives at that size. Blown up to 28px on a category tile they read as
// toolbar chrome — which is exactly what Iulian kept rejecting when comparing
// against Boost Eat's drawn category row.
//
// These are drawn for the size they're used at: a 24-unit grid, 1.6 stroke,
// round caps and joins, and a few solid accents (pepperoni, sesame, an eye)
// that give each glyph one moment of contrast instead of uniform outline. They
// are deliberately *specific* — a pizza has three pepperoni and a crust line, a
// fish has a gill and a tail notch — because specificity is the whole
// difference between an illustration and a pictogram.
//
// Shapes live as data rather than JSX so the same source can be rendered into a
// contact sheet for critique; that's how these were iterated, not by guessing.

import type { CSSProperties } from 'react';

export type FoodIconName =
  | 'pizza'
  | 'chicken'
  | 'egg'
  | 'burger'
  | 'fries'
  | 'soup'
  | 'salad'
  | 'grill'
  | 'fish'
  | 'croissant'
  | 'pasta'
  | 'cheese'
  | 'drink'
  | 'icecream'
  | 'cake'
  | 'flame'
  | 'sparkle'
  | 'leaf'
  | 'cutlery';

type Shape =
  | { d: string; solid?: boolean }
  | { cx: number; cy: number; r: number; solid?: boolean };

export const FOOD_ICON_SHAPES: Record<FoodIconName, Shape[]> = {
  // Slice with a bulging crust, a crust seam, and three pepperoni.
  pizza: [
    { d: 'M12 2.9 4.7 17.5c4.7 2.6 10 2.6 14.6 0Z' },
    { d: 'M6.6 15.8c3.5 1.7 7.4 1.7 10.8 0' },
    { cx: 10.5, cy: 10.2, r: 1.05, solid: true },
    { cx: 13.7, cy: 13.2, r: 1.05, solid: true },
    { cx: 10.1, cy: 14.4, r: 0.85, solid: true },
  ],
  // Drumstick: meat mass top-right, bone down-left ending in two knuckles.
  chicken: [
    {
      d: 'M19.8 4.2a5 5 0 0 0-7.1 0l-2.6 2.6a4.6 4.6 0 0 0 0 6.5 4.6 4.6 0 0 0 6.5 0l2.6-2.6a5 5 0 0 0 .6-6.5Z',
    },
    { d: 'M10.1 13.3 7.1 16.3' },
    { cx: 5.5, cy: 15.3, r: 2.4 },
    { cx: 8.1, cy: 17.9, r: 2.4 },
  ],
  // Fried egg: a wobbly white with an off-centre yolk.
  egg: [
    {
      d: 'M8.4 4.6c3.3-1.5 6.4-.4 7.4 2.1.7 1.8 2.5 1.5 3.5 3.1 1.3 2.1.6 5-1.8 6.4-1.9 1.1-3.8.6-5.2 1.5-1.7 1.2-4.2 1.3-6 .2-2.3-1.5-2.9-4.2-1.5-6.2.8-1.2.5-2.5.1-3.6-.5-1.7.4-2.7 3.5-3.5Z',
    },
    { cx: 12.3, cy: 11.2, r: 2.9 },
  ],
  // Sesame bun, wavy lettuce, patty, base bun.
  burger: [
    { d: 'M3.7 10.5a8.3 6.2 0 0 1 16.6 0Z' },
    { cx: 9.1, cy: 7.3, r: 0.55, solid: true },
    { cx: 12.4, cy: 6.5, r: 0.55, solid: true },
    { cx: 15.4, cy: 7.6, r: 0.55, solid: true },
    { d: 'M3.4 12.8c1.4-1 2.8-1 4.2 0s2.8 1 4.2 0 2.8-1 4.2 0 2.5 1 3.6.2' },
    { d: 'M4.3 17.5h15.4v.5a2.9 2.9 0 0 1-2.9 2.9H7.2a2.9 2.9 0 0 1-2.9-2.9Z' },
  ],
  // Carton with a band and four fries of uneven height.
  fries: [
    { d: 'M6.3 10.6h11.4l-1.1 8.9a1.7 1.7 0 0 1-1.7 1.5H9.1a1.7 1.7 0 0 1-1.7-1.5Z' },
    { d: 'M6.7 13.6h10.6' },
    { d: 'M8.9 10.4 8.2 4.9M11.6 10.4V4.1M14.3 10.4l.9-5.2M16.6 10.6l1.3-4.3' },
  ],
  // Bowl with a rim and three curls of steam.
  soup: [
    { d: 'M4 12.3a8 8 0 0 0 16 0Z' },
    { d: 'M2.4 12.3h19.2' },
    { d: 'M9 9.1c-1.1-1.3.5-2.2-.6-3.6M12.4 9.1c-1.1-1.3.5-2.2-.6-3.6M15.8 9.1c-1.1-1.3.5-2.2-.6-3.6' },
  ],
  // Bowl, two leaves and a tomato.
  salad: [
    { d: 'M3.6 13.1h16.8a8.4 8.4 0 0 1-16.8 0Z' },
    { d: 'M8.3 12.9c-1.9-2.5-.4-5.7 2.7-6.2' },
    { d: 'M12.4 12.9c.1-3 2.7-4.8 5.4-4' },
    { cx: 14.9, cy: 11.2, r: 1.4 },
  ],
  // Skewer: three cuts on a stick.
  grill: [
    { d: 'M3.8 20.2 20.2 3.8' },
    { cx: 8.5, cy: 15.5, r: 2.5 },
    { cx: 12, cy: 12, r: 2.5 },
    { cx: 15.5, cy: 8.5, r: 2.5 },
  ],
  // Body pointing left, forked tail right, gill line and a solid eye.
  fish: [
    { d: 'M2.9 12c2.7-3.7 6.1-5.5 9.5-5.5 3 0 5.4 1.5 6.8 3.1l2.4-2v8.8l-2.4-2c-1.4 1.6-3.8 3.1-6.8 3.1-3.4 0-6.8-1.8-9.5-5.5Z' },
    { d: 'M7.5 8.6c-.7 2.2-.7 4.6 0 6.8' },
    { cx: 5.6, cy: 11.3, r: 0.85, solid: true },
  ],
  // Crescent with tapered tips and three score lines.
  croissant: [
    {
      d: 'M3.6 16c0-5 3.8-8.8 8.4-8.8s8.4 3.8 8.4 8.8c-2 1-3.6-.2-3.8-2-.2-2.3-2.1-3.8-4.6-3.8s-4.4 1.5-4.6 3.8c-.2 1.8-1.8 3-3.8 2Z',
    },
    { d: 'M8.7 12.6 7.8 10.4M12 11.3V9M15.3 12.6l.9-2.2' },
  ],
  // Bowl of noodles: rim, bowl, and a twirl of pasta above it.
  pasta: [
    { d: 'M4 13.3a8 8 0 0 0 16 0Z' },
    { d: 'M2.4 13.3h19.2' },
    { d: 'M6.9 13.1c-.6-1.8.3-3.4 2.1-3.7' },
    { d: 'M10.2 13.1c-.8-2.5.7-4.7 3.2-4.7' },
    { d: 'M14.5 13.1c-.5-1.9.7-3.6 2.7-3.5' },
  ],
  // Wedge with a cut face and three holes.
  cheese: [
    { d: 'M3.3 10.9 12.4 5.2a1.9 1.9 0 0 1 2 0l5.6 3.5a1.7 1.7 0 0 1 .8 1.4v.8Z' },
    { d: 'M3.3 10.9h17.5v5.5a1.9 1.9 0 0 1-1.9 1.9H5.2a1.9 1.9 0 0 1-1.9-1.9Z' },
    { cx: 8, cy: 14.2, r: 1.1 },
    { cx: 14.4, cy: 15.3, r: 1.3 },
    { cx: 17.3, cy: 12.9, r: 0.8 },
  ],
  // Lidded cup with a straw.
  drink: [
    { d: 'M4.6 6.7h14.8a1 1 0 0 1 1 1.2l-.3 1.4H3.9l-.3-1.4a1 1 0 0 1 1-1.2Z' },
    { d: 'M5.3 9.3h13.4l-1.3 10.3a1.8 1.8 0 0 1-1.8 1.6H8.4a1.8 1.8 0 0 1-1.8-1.6Z' },
    { d: 'M13.6 6.5 15.2 2.8' },
    { d: 'M7.4 12.4h9.2' },
  ],
  // Scoop on a waffle cone.
  icecream: [
    { d: 'M7.2 10.5a4.8 4.8 0 0 1 9.6 0Z' },
    { d: 'M6.7 10.5h10.6L12 21.3Z' },
    { d: 'M8.7 13.5 13.2 15.7M10.1 16.5l2.7 1.3' },
  ],
  // Layer cake: frosted top, one seam, a candle with a flame.
  cake: [
    { d: 'M4.3 13.1h15.4v5.3a2.1 2.1 0 0 1-2.1 2.1H6.4a2.1 2.1 0 0 1-2.1-2.1Z' },
    {
      d: 'M4.3 13.1c1.3 0 1.3-1.7 2.6-1.7s1.3 1.7 2.6 1.7 1.3-1.7 2.5-1.7 1.3 1.7 2.6 1.7 1.3-1.7 2.6-1.7 1.3 1.7 2.5 1.7',
    },
    { d: 'M4.7 16.8h14.6' },
    { d: 'M12 11.3V7.7' },
    { d: 'M12 7.7c1.2-.7 1.2-2.3 0-3-1.2.7-1.2 2.3 0 3Z' },
  ],
  // Outer flame with an inner core.
  flame: [
    { d: 'M12 21.5c3.6 0 6.4-2.7 6.4-6.3 0-4.4-4-7.4-5.4-12.7-1 2.6-2.6 4-4 5.6-1.8 2-3.4 4.1-3.4 7.1 0 3.6 2.8 6.3 6.4 6.3Z' },
    { d: 'M12 21.5c1.8 0 3.1-1.3 3.1-3.1 0-2.2-1.6-3.2-3.1-5.2-1.5 2-3.1 3-3.1 5.2 0 1.8 1.3 3.1 3.1 3.1Z' },
  ],
  // One four-point star plus a smaller companion.
  sparkle: [
    { d: 'M11 3.4 12.7 8.6 17.9 10.3 12.7 12 11 17.2 9.3 12 4.1 10.3 9.3 8.6Z' },
    { d: 'M18.6 15.2 19.3 17.3 21.4 18 19.3 18.7 18.6 20.8 17.9 18.7 15.8 18 17.9 17.3Z' },
  ],
  // Leaf with a central vein.
  leaf: [
    { d: 'M4.7 19.3C3.1 15.3 4.1 10.4 7.7 7.5c3.4-2.8 7.9-3.2 12.3-2.6.4 4.4-.2 8.9-3 12.3-2.9 3.5-7.9 4.5-12.3 2.1Z' },
    { d: 'M4.9 19.1C7.5 15 11.6 11.4 17 9.3' },
  ],
  // Fallback: fork and knife.
  cutlery: [
    { d: 'M6.6 3v5.4a2.4 2.4 0 0 0 4.8 0V3' },
    { d: 'M9 8.8V21' },
    { d: 'M17.3 3c1.9 1.9 2.5 4.6 2 7.6-.2 1.4-.9 2.2-2 2.4V21' },
  ],
};

export function FoodIcon({
  name,
  className,
  style,
  strokeWidth = 1.6,
}: {
  name: FoodIconName;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      {FOOD_ICON_SHAPES[name].map((s, i) =>
        'd' in s ? (
          <path
            key={i}
            d={s.d}
            {...(s.solid ? { fill: 'currentColor', stroke: 'none' } : {})}
          />
        ) : (
          <circle
            key={i}
            cx={s.cx}
            cy={s.cy}
            r={s.r}
            {...(s.solid ? { fill: 'currentColor', stroke: 'none' } : {})}
          />
        ),
      )}
    </svg>
  );
}
