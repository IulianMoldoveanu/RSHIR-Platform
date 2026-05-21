// Realistic top-down vehicle markers for the rider's pin on the live map.
//
// This pass replaces the previous 3/4-perspective fastback (rejected as
// "extrem de facil si neplacut") with a clean orthographic top-down view —
// the perspective Uber, Bolt, Lyft, Wolt and Glovo all use for their
// rider markers. From directly above, a car reads as a recognisable real
// object: roof + windshield + hood + wheels at the corners. The previous
// version mixed perspectives (the body was 3/4 but the roof was top-down)
// which is what made it feel like a logo rather than a vehicle.
//
// Design principles
// ─────────────────
//   * Pure top-down orthographic view — no 3/4 mixing.
//   * Smooth Bézier capsule body (no rectangles) so silhouettes read as
//     aerodynamic, not boxy.
//   * Multi-stop metallic paint gradient (violet brand, 5 stops) for the
//     "painted metal under studio light" look.
//   * 4 wheels visible at the corners as dark rounded rectangles peeking
//     from under the body, just like a real car seen from a drone.
//   * Layered glass: windshield + roof + rear window with cool blue
//     reflection. Pillars between glass panels in dark indigo.
//   * Subtle hood crease + door character line for sheet-metal feel.
//   * Side mirrors as tiny rounded rectangles outside the body.
//   * LED headlight strip at the front nose, full-width LED tail bar at
//     the rear — modern EV signature.
//   * Direction arrow notch at the front so rotation reads correctly.
//   * Front of the artwork points UP, so the rotor wrapper in
//     rider-map.tsx can rotate the whole SVG to match GPS heading.
//
// Public API
// ──────────
//   - `vehicleIconHtml(type)`  → string of `<svg>...</svg>` for L.divIcon.
//   - `<VehicleIcon type=... />` for JSX previews.

import type { CSSProperties } from 'react';

export type VehicleType = 'BIKE' | 'SCOOTER' | 'CAR';

export function vehicleIconHtml(type: VehicleType): string {
  if (type === 'CAR') return carSvg();
  if (type === 'SCOOTER') return scooterSvg();
  return bikeSvg();
}

export function VehicleIcon({
  type,
  size = 56,
  className,
  style,
}: {
  type: VehicleType;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className}
      style={{ display: 'inline-block', width: size, height: size, ...style }}
      dangerouslySetInnerHTML={{ __html: vehicleIconHtml(type) }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shared defs — gradients, filters. Each icon embeds its own copy so the
// SVG is self-contained when Leaflet injects it as a divIcon (filters can
// only reference ids inside the same document).
// ─────────────────────────────────────────────────────────────────────────
function commonDefs(id: string): string {
  return `
    <defs>
      <!-- Soft drop shadow under the chassis -->
      <filter id="${id}-soft" x="-30%" y="-30%" width="160%" height="180%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="1.4"/>
        <feOffset dx="0" dy="2.4" result="off"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <!-- Floor shadow blur (separate from body shadow so it's stronger) -->
      <filter id="${id}-floor" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.4"/>
      </filter>

      <!-- Paint: metallic violet, 5 stops. Brightest along the top edge
           of the body (sunlight), darkest along the bottom edge (shadow).
           From directly above, real cars show a long bright band along
           the hood/roof centre and darker paint near the doors. -->
      <linearGradient id="${id}-paint" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%"   stop-color="#ede9fe"/>
        <stop offset="22%"  stop-color="#a78bfa"/>
        <stop offset="50%"  stop-color="#7c3aed"/>
        <stop offset="78%"  stop-color="#5b21b6"/>
        <stop offset="100%" stop-color="#1e1b4b"/>
      </linearGradient>

      <!-- Centre-line specular: a thin bright strip along the middle of
           the car body, simulating the long highlight you get from the
           sky reflecting on a painted convex roof. -->
      <linearGradient id="${id}-spec" x1="0%" y1="50%" x2="100%" y2="50%">
        <stop offset="0%"   stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="50%"  stop-color="#ffffff" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>

      <!-- Side-edge darkening: the door sills sit in shadow because the
           body curves inward at the bottom (like a real car's tumblehome). -->
      <linearGradient id="${id}-edge" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"   stop-color="#0c0420" stop-opacity="0.45"/>
        <stop offset="15%"  stop-color="#0c0420" stop-opacity="0.0"/>
        <stop offset="85%"  stop-color="#0c0420" stop-opacity="0.0"/>
        <stop offset="100%" stop-color="#0c0420" stop-opacity="0.45"/>
      </linearGradient>

      <!-- Glass: dark blue tint with a faint sky reflection along the
           top edge. Real windshields mirror the sky when seen from above. -->
      <linearGradient id="${id}-glass" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stop-color="#bfdbfe"/>
        <stop offset="35%"  stop-color="#60a5fa"/>
        <stop offset="100%" stop-color="#1e3a8a"/>
      </linearGradient>

      <!-- Roof: panoramic glass / dark painted roof, slightly lighter
           than the windshield so the eye reads it as a separate panel. -->
      <linearGradient id="${id}-roof" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stop-color="#312e81"/>
        <stop offset="100%" stop-color="#1e1b4b"/>
      </linearGradient>

      <!-- Tire rubber: subtle radial so the wheels look round, not flat. -->
      <radialGradient id="${id}-tire" cx="50%" cy="30%" r="80%">
        <stop offset="0%"   stop-color="#3f3f46"/>
        <stop offset="55%"  stop-color="#18181b"/>
        <stop offset="100%" stop-color="#000000"/>
      </radialGradient>

      <!-- Alloy rim: brushed-aluminum gradient with a bright top hot-spot. -->
      <radialGradient id="${id}-rim" cx="50%" cy="35%" r="65%">
        <stop offset="0%"   stop-color="#fafafa"/>
        <stop offset="45%"  stop-color="#a1a1aa"/>
        <stop offset="100%" stop-color="#3f3f46"/>
      </radialGradient>

      <!-- LED headlight: hot white core, cool falloff. -->
      <radialGradient id="${id}-led" cx="50%" cy="50%" r="55%">
        <stop offset="0%"   stop-color="#ffffff"/>
        <stop offset="45%"  stop-color="#e0f2fe"/>
        <stop offset="100%" stop-color="#7dd3fc" stop-opacity="0.0"/>
      </radialGradient>

      <!-- Tail-light: hot red with falloff. -->
      <radialGradient id="${id}-tail" cx="50%" cy="50%" r="55%">
        <stop offset="0%"   stop-color="#fecaca"/>
        <stop offset="40%"  stop-color="#ef4444"/>
        <stop offset="100%" stop-color="#7f1d1d"/>
      </radialGradient>

      <!-- Wheel-well shadow (where the body curves over the tire). -->
      <radialGradient id="${id}-well" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stop-color="#000000" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.0"/>
      </radialGradient>
    </defs>
  `;
}

// 5-spoke alloy wheel — kept for SCOOTER / BIKE which still use a
// 3/4 perspective. The top-down CAR draws wheels inline as dark rounded
// rectangles instead, because real top-down photos show the tire tread,
// not the rim face.
function wheel(cx: number, cy: number, r: number, id: string): string {
  const rimR = r * 0.74;
  const dishR = r * 0.58;
  const hubR = r * 0.18;
  const spokeAngles = [18, 90, 162, 234, 306];
  const spokes = spokeAngles
    .map((deg) => {
      const a = (deg * Math.PI) / 180;
      const x = cx + Math.cos(a) * rimR * 0.92;
      const y = cy + Math.sin(a) * rimR * 0.92;
      return `<path d="M ${cx} ${cy} L ${x} ${y}" stroke="#52525b" stroke-width="${r * 0.18}" stroke-linecap="round" opacity="0.85"/>`;
    })
    .join('');
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-tire)"/>
    <circle cx="${cx}" cy="${cy - r * 0.05}" r="${r * 0.93}" fill="none" stroke="#52525b" stroke-width="0.5" opacity="0.6"/>
    <circle cx="${cx}" cy="${cy}" r="${rimR}" fill="url(#${id}-rim)"/>
    <circle cx="${cx}" cy="${cy}" r="${dishR}" fill="#71717a"/>
    ${spokes}
    <circle cx="${cx}" cy="${cy}" r="${hubR}" fill="#27272a"/>
    <circle cx="${cx}" cy="${cy}" r="${hubR * 0.55}" fill="#71717a"/>
    <ellipse cx="${cx - r * 0.2}" cy="${cy - r * 0.42}" rx="${r * 0.22}" ry="${r * 0.10}" fill="#ffffff" opacity="0.55"/>
  `;
}

// ─────────────────────────────────────────────────────────────────────────
// CAR — pure top-down orthographic view. This is the perspective used by
// every major mobility app (Uber, Bolt, Lyft, Wolt, Glovo) for their rider
// markers because it reads instantly as "car from above" at small sizes.
//
// Geometry (viewBox 0 0 96 96, front = up):
//   - Body capsule: x ≈ 24..72 (width 48), y ≈ 8..86 (length 78)
//   - 4 wheels at the corners, peeking out from under the body
//   - Windshield trapezoid: y 24..40, slightly narrower at top
//   - Glass roof: y 40..58
//   - Rear window trapezoid: y 58..72
// ─────────────────────────────────────────────────────────────────────────
function carSvg(): string {
  const id = 'car';
  // Helper: a single wheel rendered as a dark rounded rectangle (the
  // tire tread you'd actually see from directly above a real car).
  // The wheel pokes slightly outside the body silhouette so it reads
  // as separate from the chassis.
  const tire = (cx: number, cy: number): string => `
    <rect x="${cx - 4.5}" y="${cy - 6.5}" width="9" height="13" rx="2.4"
          fill="#0a0a0a" stroke="#1c1c1c" stroke-width="0.6"/>
    <rect x="${cx - 3.6}" y="${cy - 5.6}" width="7.2" height="1.6" rx="0.8"
          fill="#3f3f46" opacity="0.55"/>
  `;
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="100%" height="100%">
  ${commonDefs(id)}

  <!-- Soft ground shadow: stretched ellipse beneath the car, offset down
       a touch so it reads as "car floating above ground" rather than flat. -->
  <ellipse cx="48" cy="90" rx="28" ry="3.6" fill="#000" opacity="0.38" filter="url(#${id}-floor)"/>

  <g filter="url(#${id}-soft)">
    <!-- WHEELS — drawn FIRST so the body sits on top and clips them at
         the wheel-well openings. Slightly offset outboard from the body
         centre to read as protruding tires. -->
    ${tire(24, 22)}
    ${tire(72, 22)}
    ${tire(24, 72)}
    ${tire(72, 72)}

    <!-- MAIN BODY — sleek top-down capsule. Slightly narrower at the
         front (aerodynamic nose) and rear (kammback), wider through the
         middle (door area). Built with Bézier curves for smooth sheet
         metal. -->
    <path d="
      M 36 8
      Q 30 8 28 14
      L 26 22
      Q 24 24 24 28
      L 24 44
      Q 24 46 25 47
      L 25 65
      Q 24 67 24 70
      L 24 76
      Q 24 82 28 84
      L 32 87
      Q 36 89 42 89
      L 54 89
      Q 60 89 64 87
      L 68 84
      Q 72 82 72 76
      L 72 70
      Q 72 67 71 65
      L 71 47
      Q 72 46 72 44
      L 72 28
      Q 72 24 70 22
      L 68 14
      Q 66 8 60 8
      Z" fill="url(#${id}-paint)"/>

    <!-- Centre-line specular highlight: a soft white band running the
         length of the hood/roof. Sells "painted metal in the sun". -->
    <rect x="42" y="10" width="12" height="78" rx="6" fill="url(#${id}-spec)" opacity="0.45"/>

    <!-- Side-edge darkening (tumblehome shadow on both flanks). -->
    <path d="
      M 36 8
      Q 30 8 28 14
      L 26 22
      Q 24 24 24 28
      L 24 76
      Q 24 82 28 84
      L 32 87
      Q 36 89 42 89
      L 54 89
      Q 60 89 64 87
      L 68 84
      Q 72 82 72 76
      L 72 28
      Q 72 24 70 22
      L 68 14
      Q 66 8 60 8
      Z" fill="url(#${id}-edge)"/>

    <!-- WHEEL-WELL shadows: dark crescents where the body arches over
         the tires. Drawn after the body so they sit on the paint. -->
    <ellipse cx="24" cy="22" rx="6" ry="7" fill="url(#${id}-well)"/>
    <ellipse cx="72" cy="22" rx="6" ry="7" fill="url(#${id}-well)"/>
    <ellipse cx="24" cy="72" rx="6" ry="7" fill="url(#${id}-well)"/>
    <ellipse cx="72" cy="72" rx="6" ry="7" fill="url(#${id}-well)"/>

    <!-- HOOD CREASES — twin character lines running from the nose to
         the base of the windshield. Real performance cars have these. -->
    <path d="M 38 14 Q 39 19 40 23" stroke="#0c0420" stroke-width="0.5" fill="none" opacity="0.55"/>
    <path d="M 58 14 Q 57 19 56 23" stroke="#0c0420" stroke-width="0.5" fill="none" opacity="0.55"/>
    <path d="M 38 14 Q 39 19 40 23" stroke="#ede9fe" stroke-width="0.3" fill="none" opacity="0.45" transform="translate(0.4 0)"/>
    <path d="M 58 14 Q 57 19 56 23" stroke="#ede9fe" stroke-width="0.3" fill="none" opacity="0.45" transform="translate(-0.4 0)"/>

    <!-- DOOR character line: long horizontal seam along the door panel. -->
    <path d="M 25 56 L 71 56" stroke="#0c0420" stroke-width="0.4" opacity="0.5"/>

    <!-- WINDSHIELD (front glass) — trapezoid wider at the bottom. -->
    <path d="M 38 24 L 58 24 L 60 40 L 36 40 Z" fill="url(#${id}-glass)"/>
    <!-- Specular streak on the windshield (sky reflection). -->
    <path d="M 39 25 L 57 25 L 54 28 L 42 28 Z" fill="#ffffff" opacity="0.55"/>
    <!-- A-pillars (between windshield and roof). -->
    <line x1="38" y1="24" x2="36" y2="40" stroke="#0c0420" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="58" y1="24" x2="60" y2="40" stroke="#0c0420" stroke-width="1.2" stroke-linecap="round"/>

    <!-- GLASS ROOF / PANORAMIC PANEL — the middle "cabin" section. -->
    <path d="M 36 40 L 60 40 L 60 58 L 36 58 Z" fill="url(#${id}-roof)"/>
    <!-- Faint roof reflection (subtle, dark glass doesn't reflect much). -->
    <rect x="38" y="42" width="20" height="2.4" rx="1.2" fill="#ffffff" opacity="0.18"/>

    <!-- B-pillars (between roof glass and rear window). -->
    <line x1="36" y1="58" x2="34" y2="72" stroke="#0c0420" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="60" y1="58" x2="62" y2="72" stroke="#0c0420" stroke-width="1.2" stroke-linecap="round"/>

    <!-- REAR WINDSHIELD — fastback slope, trapezoid wider at top. -->
    <path d="M 36 58 L 60 58 L 62 72 L 34 72 Z" fill="url(#${id}-glass)"/>
    <path d="M 37 59 L 59 59 L 56 62 L 40 62 Z" fill="#ffffff" opacity="0.4"/>

    <!-- TRUNK seam: tiny detail across the rear deck. -->
    <path d="M 30 78 L 66 78" stroke="#0c0420" stroke-width="0.4" opacity="0.55"/>

    <!-- SIDE MIRRORS — small rounded rectangles outboard of the windshield. -->
    <rect x="22" y="26" width="3.2" height="2.2" rx="1" fill="#1e1b4b"/>
    <rect x="22.4" y="26.3" width="2.4" height="0.8" rx="0.4" fill="#a78bfa" opacity="0.8"/>
    <rect x="70.8" y="26" width="3.2" height="2.2" rx="1" fill="#1e1b4b"/>
    <rect x="70.8" y="26.3" width="2.4" height="0.8" rx="0.4" fill="#a78bfa" opacity="0.8"/>

    <!-- LED HEADLIGHTS — twin slim strips across the nose. The hot
         white core glows; the surrounding violet of the paint reads
         as the lamp housing. -->
    <rect x="30" y="11" width="10" height="2.2" rx="1.1" fill="url(#${id}-led)"/>
    <rect x="31" y="11.4" width="8" height="0.8" rx="0.4" fill="#ffffff" opacity="0.95"/>
    <rect x="56" y="11" width="10" height="2.2" rx="1.1" fill="url(#${id}-led)"/>
    <rect x="57" y="11.4" width="8" height="0.8" rx="0.4" fill="#ffffff" opacity="0.95"/>

    <!-- FRONT GRILLE accent — slim dark band between the headlights. -->
    <rect x="41" y="11.4" width="14" height="1.4" rx="0.7" fill="#0a0a0a" opacity="0.85"/>

    <!-- FULL-WIDTH LED TAIL BAR — modern EV signature across the rear. -->
    <rect x="28" y="83" width="40" height="1.6" rx="0.8" fill="url(#${id}-tail)"/>
    <rect x="28" y="83.2" width="40" height="0.6" rx="0.3" fill="#fecaca" opacity="0.95"/>

    <!-- DIRECTION ARROW — tiny notch on the very front edge so users
         can tell which way the car is pointing even at small sizes. -->
    <path d="M 48 4 L 51 9 L 45 9 Z" fill="#ffffff" opacity="0.95"/>
  </g>
</svg>`.trim();
}

// ─────────────────────────────────────────────────────────────────────────
// SCOOTER — modern e-scooter (Lime/Bird/Tier inspired). Aluminum deck,
// upright steering column with display, slim wheels.
// ─────────────────────────────────────────────────────────────────────────
function scooterSvg(): string {
  const id = 'scooter';
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="100%" height="100%">
  ${commonDefs(id)}

  <ellipse cx="48" cy="87" rx="22" ry="3.4" fill="#000" opacity="0.32" filter="url(#${id}-floor)"/>

  <g filter="url(#${id}-soft)">
    <!-- Rear wheel -->
    ${wheel(48, 76, 8.2, id)}

    <!-- DECK — aluminum, slightly tapered, with rounded ends -->
    <path d="M 32 38 Q 32 34 36 34 L 60 34 Q 64 34 64 38 L 64 70 Q 64 74 60 74 L 36 74 Q 32 74 32 70 Z"
          fill="url(#${id}-paint)"/>

    <!-- Aluminum grain on the deck (faint horizontal lines) -->
    ${Array.from({ length: 5 }, (_, i) => i)
      .map(
        (i) =>
          `<line x1="35" y1="${44 + i * 6}" x2="61" y2="${44 + i * 6}" stroke="#1e1b4b" stroke-width="0.3" opacity="0.4"/>`,
      )
      .join('')}

    <!-- Anti-slip pattern on the deck (diamond dots) -->
    ${[0, 1, 2, 3, 4]
      .flatMap((row) =>
        [0, 1, 2, 3].map(
          (col) =>
            `<circle cx="${38 + col * 7}" cy="${46 + row * 5}" r="0.8" fill="#0c0420" opacity="0.6"/>`,
        ),
      )
      .join('')}

    <!-- Specular highlight band on the deck (top edge) -->
    <rect x="36" y="35" width="24" height="1.4" rx="0.7" fill="#ffffff" opacity="0.55"/>

    <!-- Steering column — vertical bar from deck up to handlebar -->
    <path d="M 44 34 L 43 18 Q 43 14 47 14 L 49 14 Q 53 14 53 18 L 52 34 Z"
          fill="url(#${id}-paint)"/>
    <!-- Column highlight stripe -->
    <rect x="46" y="14" width="0.7" height="20" fill="#ede9fe" opacity="0.6"/>

    <!-- Digital display on top of the column -->
    <rect x="42" y="14" width="12" height="3.5" rx="1" fill="#0c0420"/>
    <rect x="42.5" y="14.4" width="11" height="2.7" rx="0.6" fill="#1e3a8a"/>
    <text x="48" y="16.7" font-size="2" fill="#7dd3fc" text-anchor="middle" font-family="monospace" font-weight="bold">25</text>

    <!-- Handlebars (horizontal black bar with rubber grips) -->
    <rect x="22" y="10" width="52" height="4.6" rx="2.3" fill="#27272a"/>
    <rect x="22" y="10" width="52" height="1.4" rx="0.7" fill="#ffffff" opacity="0.4"/>
    <!-- Grips -->
    <rect x="20" y="9" width="6" height="6.6" rx="2.6" fill="#0c0420"/>
    <rect x="20.6" y="9.5" width="4.8" height="1.4" rx="0.7" fill="#3b3b54" opacity="0.6"/>
    <rect x="70" y="9" width="6" height="6.6" rx="2.6" fill="#0c0420"/>
    <rect x="70.6" y="9.5" width="4.8" height="1.4" rx="0.7" fill="#3b3b54" opacity="0.6"/>

    <!-- Brake levers -->
    <path d="M 26 12 Q 30 10 32 13" stroke="#27272a" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M 70 12 Q 66 10 64 13" stroke="#27272a" stroke-width="1.2" fill="none" stroke-linecap="round"/>

    <!-- Front wheel (smaller than rear, typical e-scooter geometry) -->
    ${wheel(48, 22, 5.8, id)}

    <!-- Fender over the front wheel -->
    <path d="M 42 22 Q 48 17 54 22" stroke="url(#${id}-paint)" stroke-width="1.4" fill="none" stroke-linecap="round"/>

    <!-- LED headlight (mounted on the column) -->
    <ellipse cx="48" cy="11" rx="3.5" ry="2.2" fill="url(#${id}-led)"/>
    <ellipse cx="48" cy="11" rx="1.6" ry="0.9" fill="#ffffff"/>
  </g>
</svg>`.trim();
}

// ─────────────────────────────────────────────────────────────────────────
// BIKE — modern city e-bike, side-3/4 view. Curved frame, larger wheels,
// integrated battery hint in the down-tube.
// ─────────────────────────────────────────────────────────────────────────
function bikeSvg(): string {
  const id = 'bike';
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="100%" height="100%">
  ${commonDefs(id)}

  <ellipse cx="48" cy="87" rx="22" ry="3.2" fill="#000" opacity="0.30" filter="url(#${id}-floor)"/>

  <g filter="url(#${id}-soft)">
    <!-- Rear wheel -->
    ${wheel(48, 70, 12, id)}

    <!-- DOWN TUBE (battery integrated, thick) -->
    <path d="M 48 70 L 48 36" stroke="url(#${id}-paint)" stroke-width="7" stroke-linecap="round"/>
    <!-- Battery cells visible as faint dividers -->
    <line x1="44.6" y1="50" x2="51.4" y2="50" stroke="#1e1b4b" stroke-width="0.4" opacity="0.55"/>
    <line x1="44.6" y1="58" x2="51.4" y2="58" stroke="#1e1b4b" stroke-width="0.4" opacity="0.55"/>
    <!-- Down-tube highlight (vertical light stripe) -->
    <rect x="46" y="38" width="0.7" height="30" fill="#ede9fe" opacity="0.55"/>

    <!-- TOP TUBE -->
    <path d="M 48 36 L 40 22" stroke="url(#${id}-paint)" stroke-width="5" stroke-linecap="round"/>
    <!-- CHAIN STAY -->
    <path d="M 48 36 L 62 70" stroke="url(#${id}-paint)" stroke-width="5" stroke-linecap="round"/>
    <!-- Frame highlight strokes -->
    <path d="M 49 36 L 41 22" stroke="#ede9fe" stroke-width="0.6" opacity="0.5"/>
    <path d="M 49 36 L 63 70" stroke="#ede9fe" stroke-width="0.6" opacity="0.5"/>

    <!-- SADDLE -->
    <path d="M 42 35 Q 48 31 54 35 L 54 37 Q 48 39 42 37 Z" fill="#0c0420"/>
    <path d="M 42 35 Q 48 31 54 35" stroke="#3b3b54" stroke-width="0.6" fill="none"/>
    <ellipse cx="46" cy="34" rx="2.2" ry="0.6" fill="#ffffff" opacity="0.4"/>

    <!-- Front wheel -->
    ${wheel(48, 22, 11, id)}

    <!-- FORK -->
    <path d="M 40 22 L 48 30" stroke="#52525b" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M 40 22 L 46 14" stroke="#52525b" stroke-width="2.2" stroke-linecap="round"/>

    <!-- HANDLEBAR (curved bullhorn) -->
    <path d="M 26 14 Q 34 12 46 13 L 50 13 Q 62 12 70 14"
          stroke="#27272a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <!-- Bar tape ends -->
    <circle cx="26" cy="14" r="2.2" fill="#0c0420"/>
    <circle cx="70" cy="14" r="2.2" fill="#0c0420"/>
    <ellipse cx="25.6" cy="13.5" rx="1.4" ry="0.5" fill="#3b3b54" opacity="0.7"/>

    <!-- Brake caliper -->
    <rect x="44" y="22" width="2" height="1.4" rx="0.3" fill="#52525b"/>

    <!-- LED headlight -->
    <circle cx="48" cy="8" r="3" fill="url(#${id}-led)"/>
    <circle cx="48" cy="8" r="1.3" fill="#ffffff"/>

    <!-- Rear tail-light -->
    <rect x="46" y="79" width="4" height="1.4" rx="0.7" fill="#ef4444"/>
    <rect x="46.5" y="79.2" width="3" height="0.4" rx="0.2" fill="#fecaca" opacity="0.9"/>
  </g>
</svg>`.trim();
}
