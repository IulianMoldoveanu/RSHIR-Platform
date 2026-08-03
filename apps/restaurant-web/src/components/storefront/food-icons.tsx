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
  // Slice with a scalloped crust, a crust seam, three pepperoni and two herb
  // specks. The scallops are the point: a straight-edged triangle is a
  // pictogram, four bites of crust make it a drawing.
  pizza: [
    { d: 'M12 2.6 4.8 16.4q1.8 2.5 3.6 0 1.8 2.5 3.6 0 1.8 2.5 3.6 0 1.8 2.5 3.6 0Z' },
    { d: 'M6.4 13.8c3.6 1.7 7.6 1.7 11.2 0' },
    { cx: 12, cy: 7.9, r: 1.15, solid: true },
    { cx: 9.5, cy: 12.2, r: 1.15, solid: true },
    { cx: 14.4, cy: 12.4, r: 1, solid: true },
    { cx: 11.2, cy: 10.6, r: 0.5, solid: true },
    { cx: 14.1, cy: 9.4, r: 0.5, solid: true },
  ],
  // Drumstick: meat mass top-right, bone down-left ending in two knuckles.
  //
  // Left plain on purpose. Two attempts at adding interior detail both failed
  // on the sheet: one long crease arc closed a second blob and the glyph read
  // as a snail; two short parallel ticks read as a label stuck on a pill. The
  // meat is a smooth rounded mass — anything drawn inside it reads as a
  // separate object, because there is nothing for the mark to follow.
  chicken: [
    {
      d: 'M19.8 4.2a5 5 0 0 0-7.1 0l-2.6 2.6a4.6 4.6 0 0 0 0 6.5 4.6 4.6 0 0 0 6.5 0l2.6-2.6a5 5 0 0 0 .6-6.5Z',
    },
    { d: 'M10.1 13.3 7.1 16.3' },
    { cx: 5.5, cy: 15.3, r: 2.4 },
    { cx: 8.1, cy: 17.9, r: 2.4 },
  ],
  // Fried egg: a wobbly white, an off-centre yolk, a highlight on the yolk.
  egg: [
    {
      d: 'M8.4 4.6c3.3-1.5 6.4-.4 7.4 2.1.7 1.8 2.5 1.5 3.5 3.1 1.3 2.1.6 5-1.8 6.4-1.9 1.1-3.8.6-5.2 1.5-1.7 1.2-4.2 1.3-6 .2-2.3-1.5-2.9-4.2-1.5-6.2.8-1.2.5-2.5.1-3.6-.5-1.7.4-2.7 3.5-3.5Z',
    },
    { cx: 12.3, cy: 11.2, r: 2.9 },
    { d: 'M10.7 9.9a2.1 2.1 0 0 1 2.3-.6' },
  ],
  // Five layers, spaced on a 3.2-unit rhythm: sesame bun, lettuce, patty, base
  // bun. The rhythm isn't taste — two stacked strokes closer than ~2× the
  // stroke width merge into one grey band at 34px, which is what the old
  // three-layer build did wherever it was drawn small.
  burger: [
    { d: 'M3.6 6a8.4 5.6 0 0 1 16.8 0Z' },
    { cx: 8.4, cy: 3.2, r: 0.5, solid: true },
    { cx: 11.7, cy: 2.3, r: 0.5, solid: true },
    { cx: 14.9, cy: 3, r: 0.5, solid: true },
    { cx: 17.4, cy: 4.4, r: 0.45, solid: true },
    { cx: 6.4, cy: 4.6, r: 0.45, solid: true },
    { d: 'M3.5 9.4c1.45-1.1 2.9-1.1 4.35 0s2.9 1.1 4.35 0 2.9-1.1 4.35 0 2.55 1 3.75.1' },
    { d: 'M4.3 12.6h15.4a1.5 1.5 0 0 1 0 3H4.3a1.5 1.5 0 0 1 0-3Z' },
    { d: 'M4.1 18.4h15.8v.6a2.9 2.9 0 0 1-2.9 2.9H7a2.9 2.9 0 0 1-2.9-2.9Z' },
  ],
  // Carton with one band and five splayed fries. Six fries at 2.2 spacing
  // packed into a solid grey block on the sheet; five at 2.6 with real fan-out
  // read as separate sticks.
  //
  // One band, not two. A second horizontal line turned the carton into a waste
  // bin, and the chevron that was there before it read as a "back" arrow.
  fries: [
    { d: 'M6.9 10.5 5.9 6.2M9.4 10.5 8.7 4.1M12 10.5 12 3.2' },
    { d: 'M14.6 10.5 15.5 4.3M17.1 10.5 18.5 6.3' },
    { d: 'M5.8 10.6h12.4l-1.3 9.3a1.8 1.8 0 0 1-1.8 1.6H8.9a1.8 1.8 0 0 1-1.8-1.6Z' },
    { d: 'M6.2 13.9h11.6' },
  ],
  // Bowl with a rim, a spoon standing in it, and two curls of steam. The spoon
  // is what separates this from `pasta` and `salad` at a glance — all three are
  // a bowl, and only one of them has cutlery in it.
  //
  // The spoon head is a rotated oval, not a circle. A circle on the end of a
  // straight line is a balloon, and that is exactly what the first render
  // looked like; an oval whose long axis continues the handle reads as one
  // object instead of two.
  soup: [
    { d: 'M3.8 12.8a8.2 8.2 0 0 0 16.4 0Z' },
    { d: 'M2.2 12.8h19.6' },
    { d: 'M6.9 16.4c2.3 1.3 4.9 1.7 7.5 1.3' },
    { d: 'M17.4 5.6 14.6 10.4' },
    { d: 'M17.21 5.82a1.15 1.85 28.8 1 1 1.78-3.24 1.15 1.85 28.8 1 1-1.78 3.24Z' },
    { d: 'M8 9.9c-1.1-1.3.5-2.2-.6-3.6' },
    { d: 'M11.4 9.9c-1.1-1.3.5-2.2-.6-3.6' },
  ],
  // Bowl with two pointed leaves fanning out of it, each veined, and a tomato
  // in the gap between their tips.
  //
  // The leaves are closed lens shapes, not open curves. Open curves plus a
  // circle rendered as a scribble with an eye in it — the glyph read as a face.
  // A lens has a silhouette, so it survives being small.
  //
  // Two leaves, not three: a leaf outline is ~2.4 units wide and the stroke
  // eats 1.6 more, so three of them plus clear gaps do not fit across a bowl
  // this size. That is arithmetic, and the sheet showed it.
  salad: [
    { d: 'M3.6 14h16.8a8.4 7 0 0 1-16.8 0Z' },
    { d: 'M6.8 17.2c2.3 1.4 5 1.9 7.6 1.4' },
    { d: 'M9.8 13.6Q11.1 8.9 6.6 7.4 5.3 12.1 9.8 13.6Z' },
    { d: 'M9.4 12.9 7 8.2' },
    { d: 'M14.2 13.6Q12.9 8.9 17.4 7.4 18.7 12.1 14.2 13.6Z' },
    { d: 'M14.6 12.9 17 8.2' },
    { cx: 12, cy: 9.2, r: 1.5 },
  ],
  // Skewer: three cuts on a stick, each with a char mark. The marks run
  // perpendicular to the skewer and sit off-centre, so they read as searing
  // rather than as an X through every cube.
  grill: [
    { d: 'M2.6 21.4 21.4 2.6' },
    { cx: 7.8, cy: 16.2, r: 2.45 },
    { cx: 12, cy: 12, r: 2.45 },
    { cx: 16.2, cy: 7.8, r: 2.45 },
    { d: 'M6.6 14.3 9 16.7M10.8 10.1 13.2 12.5M15 5.9 17.4 8.3' },
  ],
  // Body pointing left, forked tail right, triangular dorsal and ventral fins,
  // gill line, two scale arcs and a solid eye. The fins were swept curves in
  // the first pass and read as two loose hooks floating near the fish; a
  // straight-sided spike whose base sits exactly on the body outline reads as
  // attached.
  fish: [
    { d: 'M2.9 12c2.7-3.7 6.1-5.5 9.5-5.5 3 0 5.4 1.5 6.8 3.1l2.4-2v8.8l-2.4-2c-1.4 1.6-3.8 3.1-6.8 3.1-3.4 0-6.8-1.8-9.5-5.5Z' },
    { d: 'M10.2 7 12.8 3.4 15.2 7.2' },
    { d: 'M11 17.5 12.6 20.4 15 16.7' },
    { d: 'M7.5 8.6c-.7 2.2-.7 4.6 0 6.8' },
    { d: 'M11.2 10.3a2.9 2.9 0 0 1 0 3.4M14 10.7a2.5 2.5 0 0 1 0 2.6' },
    { cx: 5.6, cy: 11.3, r: 0.85, solid: true },
  ],
  // Breakfast. This slot was a croissant for two design passes and read as a
  // bridge both times — a symmetric tapered arch simply is a bridge, no matter
  // where the points go. A cup on a saucer is unambiguous, and it still covers
  // the keywords ("mic dejun", "brunch", "patiserie"). The tapered body, handle
  // and dished saucer keep it clearly distinct from `drink`, which is a tall
  // lidded cup with a straw.
  coffee: [
    { d: 'M4.4 6.6h12.2l-1.5 9a2 2 0 0 1-2 1.7H7.9a2 2 0 0 1-2-1.7Z' },
    { d: 'M16.4 8.4h1.9a2.5 2.5 0 0 1 0 5h-2.2' },
    { d: 'M5.1 9.4h11.1' },
    { d: 'M2.2 18.8h19.6a9.8 2.6 0 0 1-19.6 0Z' },
    { d: 'M7.8 4c-.8-.9.4-1.5-.4-2.4M12 4c-.8-.9.4-1.5-.4-2.4M15.6 4.4c-.7-.8.3-1.3-.3-2.1' },
  ],
  // Bowl of noodles: rim, bowl, an inner highlight, and five strands of
  // different heights twirling out of it.
  //
  // Known soft spot, managed rather than solved. This shares a bowl with `soup`
  // and `salad`; six alternative constructions were drawn and rendered — fork
  // with a twirl, fork with draped strands, penne, a noodle nest, farfalle,
  // bare strands — and every one read as something worse (a balloon on a stick,
  // a palm tree, binoculars, a croissant, a bow tie, heat waves). What separates
  // it now is density: five strands versus soup's spoon versus salad's leaves.
  // No inner highlight on this one, unlike `soup` and `salad`. The highlight is
  // a smile, and anything drawn above a smile inside a round bowl becomes a
  // face: with it, five strands leaning the same way were a pair of eyebrows
  // and five alternating ones were a pair of eyes. Without it the same strokes
  // are just noodles heaped in a bowl.
  pasta: [
    { d: 'M3.6 14.2a8.4 8.4 0 0 0 16.8 0Z' },
    { d: 'M2 14.2h20' },
    { d: 'M6.4 14c-1-2.3.2-4.3 2.4-4.6' },
    { d: 'M9.4 14c-1.2-3.2.6-6 3.6-6.1' },
    { d: 'M13.2 14c-.6-3 1-5.5 3.6-5.6' },
    { d: 'M16.8 14c-.4-1.9.6-3.4 2.2-3.6' },
  ],
  // Wedge with a cut face and five holes.
  cheese: [
    { d: 'M3.3 10.9 12.4 5.2a1.9 1.9 0 0 1 2 0l5.6 3.5a1.7 1.7 0 0 1 .8 1.4v.8Z' },
    { d: 'M3.3 10.9h17.5v5.5a1.9 1.9 0 0 1-1.9 1.9H5.2a1.9 1.9 0 0 1-1.9-1.9Z' },
    { cx: 7.6, cy: 14.2, r: 1.15 },
    { cx: 14.2, cy: 15.4, r: 1.35 },
    { cx: 17.4, cy: 12.9, r: 0.8 },
    { cx: 11.2, cy: 12.6, r: 0.55 },
    { cx: 11, cy: 16.1, r: 0.65 },
  ],
  // Lidded cup with a straw, a band and a smile mark where a logo would go.
  drink: [
    { d: 'M4.6 6.7h14.8a1 1 0 0 1 1 1.2l-.3 1.4H3.9l-.3-1.4a1 1 0 0 1 1-1.2Z' },
    { d: 'M5.3 9.3h13.4l-1.3 10.3a1.8 1.8 0 0 1-1.8 1.6H8.4a1.8 1.8 0 0 1-1.8-1.6Z' },
    { d: 'M13.6 6.5 15.2 2.8' },
    { d: 'M6.9 12.5h10.2' },
    { d: 'M9.5 16.1c1.6 1.4 3.4 1.4 5 0' },
  ],
  // Twin scoops on a cross-hatched waffle cone. A single scoop gave the glyph
  // one round top over a taper — which is exactly a map pin, and that's what it
  // read as. Two overlapping bumps break that silhouette.
  //
  // Nothing else goes on this glyph. Two circles above a triangle is one mark
  // away from a face, and both marks that were tried landed on it: a cherry in
  // the saddle made a skull, a rim band across the cone made a mouth with the
  // hatching for teeth. The cross-hatch alone is the detail.
  icecream: [
    { cx: 9.2, cy: 6.6, r: 3.2 },
    { cx: 14.8, cy: 6.6, r: 3.2 },
    { d: 'M5.3 10.2h13.4L12 21.8Z' },
    { d: 'M7.5 13.6 13.6 16.4M9 16.6l3.4 1.4' },
    { d: 'M16.5 13.6 10.4 16.4M15 16.6l-3.4 1.4' },
  ],
  // Cupcake: fluted case, swirled dome, a cherry. The layer cake that used to
  // live here read as a briefcase with an antenna. A wedge was the obvious
  // alternative and was rejected on rendering too — a triangle is already the
  // pizza slice. The fluted case is a silhouette nothing else in the set owns.
  cake: [
    { d: 'M5.2 10.7h13.6l-1.6 8.8a1.9 1.9 0 0 1-1.9 1.6H8.7a1.9 1.9 0 0 1-1.9-1.6Z' },
    { d: 'M9.1 10.9l.8 10.1M14.9 10.9l-.8 10.1' },
    {
      d: 'M5.4 10.7c-.6-2.2 1-3.9 2.9-3.6C8.6 5 10.2 3.7 12 3.7s3.4 1.3 3.7 3.4c1.9-.3 3.5 1.4 2.9 3.6Z',
    },
    { d: 'M8.4 8.6c1-.9 2.2-1.3 3.6-1.3s2.6.4 3.6 1.3' },
    { cx: 12, cy: 2.3, r: 1.15, solid: true },
  ],
  // Outer flame, inner core, three sparks.
  flame: [
    { d: 'M12 21.5c3.6 0 6.4-2.7 6.4-6.3 0-4.4-4-7.4-5.4-12.7-1 2.6-2.6 4-4 5.6-1.8 2-3.4 4.1-3.4 7.1 0 3.6 2.8 6.3 6.4 6.3Z' },
    { d: 'M12 21.5c1.8 0 3.1-1.3 3.1-3.1 0-2.2-1.6-3.2-3.1-5.2-1.5 2-3.1 3-3.1 5.2 0 1.8 1.3 3.1 3.1 3.1Z' },
    { cx: 20.4, cy: 8.6, r: 0.75, solid: true },
    { cx: 4, cy: 10.8, r: 0.6, solid: true },
    { cx: 18.6, cy: 4.4, r: 0.5, solid: true },
  ],
  // One four-point star plus two smaller companions.
  sparkle: [
    { d: 'M10.6 3 12.3 8.2 17.5 9.9 12.3 11.6 10.6 16.8 8.9 11.6 3.7 9.9 8.9 8.2Z' },
    { d: 'M18.4 14.4 19.2 16.7 21.5 17.5 19.2 18.3 18.4 20.6 17.6 18.3 15.3 17.5 17.6 16.7Z' },
    { d: 'M5.6 17.6 6.1 19.1 7.6 19.6 6.1 20.1 5.6 21.6 5.1 20.1 3.6 19.6 5.1 19.1Z' },
  ],
  // Leaf with a midrib and three side veins.
  //
  // The veins leave the midrib at roughly 40° and all point at the tip, which
  // is both what real venation does and what keeps them readable. Two earlier
  // attempts failed on that angle: five veins branching in both directions
  // filled the interior and the leaf became a rugby ball with laces, and two
  // veins drawn parallel to the midrib merged into it as one thick stroke.
  leaf: [
    { d: 'M4.7 19.3C3.1 15.3 4.1 10.4 7.7 7.5c3.4-2.8 7.9-3.2 12.3-2.6.4 4.4-.2 8.9-3 12.3-2.9 3.5-7.9 4.5-12.3 2.1Z' },
    { d: 'M4.9 19.1C7.5 15 11.6 11.4 17 9.3' },
    { d: 'M7.6 15.6c.2-1.4.4-2.7.6-4M11.2 12.5c.3-1.2.7-2.3 1.1-3.4M13.9 10.7c.3-1 .7-1.9 1.1-2.8' },
  ],
  // Fallback: three-tined fork and a knife.
  cutlery: [
    { d: 'M6.6 3v5.4a2.4 2.4 0 0 0 4.8 0V3' },
    { d: 'M9 3v5.6' },
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
  pizza: [4.8, 2.6, 14.4, 15.05],
  chicken: [3.1, 2.72, 17.63, 17.58],
  egg: [4.05, 3.92, 15.89, 14.75],
  burger: [2.8, 0.4, 18.4, 21.5],
  fries: [5.8, 3.2, 12.7, 18.3],
  soup: [2.2, 2.46, 19.6, 18.54],
  salad: [3.6, 7.4, 16.8, 13.6],
  grill: [2.6, 2.6, 18.8, 18.8],
  fish: [2.9, 3.4, 18.7, 17],
  coffee: [2.2, 1.6, 19.6, 19.8],
  pasta: [2, 7.9, 20, 14.7],
  cheese: [3.3, 4.92, 17.5, 13.38],
  drink: [3.58, 2.8, 16.84, 18.4],
  icecream: [5.3, 3.4, 13.4, 18.4],
  cake: [5.2, 1.15, 13.6, 19.95],
  flame: [3.4, 2.5, 17.75, 19],
  sparkle: [3.6, 3, 17.9, 18.6],
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
