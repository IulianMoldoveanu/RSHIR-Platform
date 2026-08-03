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
//
// 2026-08-03 — second design pass, all of it driven by rendered evidence:
//
//   * Optical sizing. Measuring every glyph's real bounding box showed a set
//     that only *looked* hand-made: soup and pasta inked 20.8 units wide while
//     ice cream managed 12.2. Uneven glyph size across a row is the clearest
//     tell of an amateur icon set. Every glyph is now scaled to a shared live
//     area — see FOOD_ICON_BOX below.
//   * Three glyphs were redrawn because rendering them proved they read as
//     something else: the croissant was a bridge (twice), the layer cake a
//     briefcase, the ice cream a map pin. Each was rebuilt on a *different*
//     construction rather than nudged — coffee cup, cupcake, twin scoops.

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
  | 'coffee'
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
  // Breakfast. This slot was a croissant for two design passes and read as a
  // bridge both times — a symmetric tapered arch simply is a bridge, no matter
  // where the points go. A cup on a saucer is unambiguous, and it still covers
  // the keywords ("mic dejun", "brunch", "patiserie"). The squat body, handle
  // and saucer line keep it clearly distinct from `drink`, which is a tall
  // lidded cup with a straw.
  coffee: [
    { d: 'M4.3 6.6h12.4v5.5a6.2 6.2 0 0 1-12.4 0Z' },
    { d: 'M16.9 7.9h1.9a2.6 2.6 0 0 1 0 5.2h-2' },
    { d: 'M2.4 19.4h17.4' },
    { d: 'M8.2 3.9c-.8-.9.4-1.5-.4-2.4M12.4 3.9c-.8-.9.4-1.5-.4-2.4' },
  ],
  // Bowl of noodles: rim, bowl, and a twirl of pasta above it.
  //
  // Known soft spot, left alone deliberately. This shares a bowl with `soup`
  // and `salad`, so at 30px the three are closer than I'd like. Six alternative
  // constructions were drawn and rendered — fork with a twirl, fork with draped
  // strands, penne, a noodle nest, farfalle, bare strands — and every one read
  // as something worse (a balloon on a stick, a palm tree, binoculars, a
  // croissant, a bow tie, heat waves). A decent bowl beats a confident mistake,
  // and the category label sits directly underneath in every place this renders.
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
  // Twin scoops on a waffle cone. A single scoop gave the glyph one round top
  // over a taper — which is exactly a map pin, and that's what it read as. Two
  // bumps break that silhouette outright.
  icecream: [
    { cx: 9.1, cy: 6.6, r: 3.2 },
    { cx: 14.9, cy: 6.6, r: 3.2 },
    { d: 'M5.4 10.2h13.2L12 21.6Z' },
    { d: 'M7.6 13.1 14.2 16M9.2 16.2l3.9 1.7' },
  ],
  // Cupcake: fluted case, domed frosting, a cherry. The layer cake that used to
  // live here read as a briefcase with an antenna. A wedge was the obvious
  // alternative and was rejected on rendering too — a triangle is already the
  // pizza slice. The fluted case is a silhouette nothing else in the set owns.
  cake: [
    { d: 'M5.2 10.7h13.6l-1.6 8.8a1.9 1.9 0 0 1-1.9 1.6H8.7a1.9 1.9 0 0 1-1.9-1.6Z' },
    { d: 'M9.1 10.9l.8 10.1M14.9 10.9l-.8 10.1' },
    {
      d: 'M5.4 10.7c-.6-2.2 1-3.9 2.9-3.6C8.6 5 10.2 3.7 12 3.7s3.4 1.3 3.7 3.4c1.9-.3 3.5 1.4 2.9 3.6Z',
    },
    { cx: 12, cy: 2.3, r: 1.15, solid: true },
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

/**
 * Each glyph's raw geometry bounding box, `[x, y, width, height]` in viewBox
 * units, EXCLUDING the stroke.
 *
 * These are measurements, not design decisions — produced by rendering the
 * shapes above and reading `getBBox()` off each group. Re-measure whenever a
 * path changes; a stale box only shifts the glyph slightly off-centre, so it
 * fails quietly, which is why `everyIconHasABox` exists in the test file.
 *
 * They're here because uniform stroke weight is not the same thing as uniform
 * optical size, and only the second one is what the eye reads across a row.
 * Drawn by hand the set ranged from 12.2 units wide (ice cream) to 20.8
 * (soup) — the icons looked like they belonged to different families.
 */
export const FOOD_ICON_BOX: Record<FoodIconName, [number, number, number, number]> = {
  pizza: [4.7, 2.9, 14.6, 16.55],
  chicken: [3.1, 2.72, 17.63, 17.58],
  egg: [4.05, 3.92, 15.89, 14.75],
  burger: [3.4, 4.3, 16.9, 16.6],
  fries: [6.3, 4.1, 11.6, 16.9],
  soup: [2.4, 5.5, 19.2, 14.8],
  salad: [3.6, 6.7, 16.8, 14.8],
  grill: [3.8, 3.8, 16.4, 16.4],
  fish: [2.9, 6.5, 18.7, 11],
  coffee: [2.4, 1.5, 19, 17.9],
  pasta: [2.4, 8.4, 19.2, 12.9],
  cheese: [3.3, 4.92, 17.5, 13.38],
  drink: [3.58, 2.8, 16.84, 18.4],
  icecream: [5.4, 3.4, 13.2, 18.2],
  cake: [5.2, 1.15, 13.6, 19.95],
  flame: [5.6, 2.5, 12.8, 19],
  sparkle: [4.1, 3.4, 17.3, 17.4],
  leaf: [3.96, 4.66, 16.15, 15.95],
  cutlery: [6.6, 3, 12.87, 18],
};

/** Side of the square every glyph is fitted into, inside the 24-unit box. */
const LIVE_AREA = 20;

/**
 * Scale + offset that drops a glyph's inked box into the live area, centred.
 * Exported so the tests can assert the result without a browser.
 */
export function opticalFit(name: FoodIconName, strokeWidth: number) {
  const [x, y, w, h] = FOOD_ICON_BOX[name];
  // The stroke straddles the path, so it adds half its width on each side —
  // one full stroke width across each axis.
  const scale = Math.min(LIVE_AREA / (w + strokeWidth), LIVE_AREA / (h + strokeWidth));
  return {
    scale,
    dx: 12 - (x + w / 2) * scale,
    dy: 12 - (y + h / 2) * scale,
  };
}

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
  const { scale, dx, dy } = opticalFit(name, strokeWidth);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      // Divided by the scale so the *rendered* stroke stays exactly
      // `strokeWidth` for every glyph. Without this, fitting the glyphs to a
      // common size would make the small ones bolder than the large ones —
      // trading one kind of inconsistency for a worse-looking one.
      strokeWidth={strokeWidth / scale}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      <g transform={`translate(${dx.toFixed(3)} ${dy.toFixed(3)}) scale(${scale.toFixed(4)})`}>
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
      </g>
    </svg>
  );
}
