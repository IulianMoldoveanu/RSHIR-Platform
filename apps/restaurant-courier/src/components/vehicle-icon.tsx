// Realistic 3D-style vehicle markers for the rider's pin on the live map.
// Total redesign — the previous version (rectangular 3/4 view) was rejected
// for looking "extrem de facil si neplacut". This pass aims for a Tesla-
// Model-3-class silhouette + EV-bike + e-scooter aesthetic so the marker
// reads as a real, modern vehicle instead of a logo.
//
// Design principles
// ─────────────────
//   * Curves over rectangles. Body shapes use Bézier paths (Q/C) so the
//     silhouettes are smooth, aerodynamic, fastback-like.
//   * Multi-stop metallic gradients (5-stop where it counts) so the paint
//     reads as painted metal under studio light, not flat fill.
//   * Layered specular highlights: a long, soft band of light along the
//     top edge, a small bright spot near the front, faint reflection
//     bands along the door.
//   * Multi-spoke alloy wheels (5-spoke design with concave dish) instead
//     of generic disks, with a tiny rim-highlight on the front face.
//   * Soft, blurred ground shadow per icon (Gaussian filter).
//   * Front of the artwork points UP, so the marker container in
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
        <feGaussianBlur in="SourceAlpha" stdDeviation="1.6"/>
        <feOffset dx="0" dy="3" result="off"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <!-- Floor shadow blur (separate from body shadow so it's stronger) -->
      <filter id="${id}-floor" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.2"/>
      </filter>

      <!-- Paint: metallic violet, 5 stops. Top edge nearly white, mids
           rich purple, undercarriage near-black indigo. -->
      <linearGradient id="${id}-paint" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%"   stop-color="#f5f3ff"/>
        <stop offset="18%"  stop-color="#c4b5fd"/>
        <stop offset="42%"  stop-color="#8b5cf6"/>
        <stop offset="72%"  stop-color="#6d28d9"/>
        <stop offset="100%" stop-color="#2e1065"/>
      </linearGradient>

      <!-- Side-light overlay: bright on the lit side, shadow on the far
           side. Applied on top of the paint to fake studio lighting. -->
      <linearGradient id="${id}-rim-light" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.55"/>
        <stop offset="30%"  stop-color="#ffffff" stop-opacity="0.0"/>
        <stop offset="70%"  stop-color="#0b0420" stop-opacity="0.0"/>
        <stop offset="100%" stop-color="#0b0420" stop-opacity="0.55"/>
      </linearGradient>

      <!-- Glass: dark blue tint with a faint sky reflection along the
           top edge. Real cars do this — windshield mirrors the sky. -->
      <linearGradient id="${id}-glass" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stop-color="#dbeafe"/>
        <stop offset="20%"  stop-color="#93c5fd"/>
        <stop offset="55%"  stop-color="#1e40af"/>
        <stop offset="100%" stop-color="#0c1a4d"/>
      </linearGradient>

      <!-- Tire rubber: subtle radial so the wheels look round, not flat. -->
      <radialGradient id="${id}-tire" cx="35%" cy="32%" r="80%">
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

      <!-- Wheel-well shadow (where the body curves over the tire). -->
      <radialGradient id="${id}-well" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stop-color="#000000" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.0"/>
      </radialGradient>

      <!-- LED headlight: hot white core, golden falloff. -->
      <radialGradient id="${id}-led" cx="50%" cy="50%" r="55%">
        <stop offset="0%"   stop-color="#ffffff"/>
        <stop offset="40%"  stop-color="#fef9c3"/>
        <stop offset="100%" stop-color="#fbbf24" stop-opacity="0.0"/>
      </radialGradient>

      <!-- Tail-light: hot red with falloff. -->
      <radialGradient id="${id}-tail" cx="50%" cy="50%" r="55%">
        <stop offset="0%"   stop-color="#fecaca"/>
        <stop offset="40%"  stop-color="#ef4444"/>
        <stop offset="100%" stop-color="#7f1d1d"/>
      </radialGradient>
    </defs>
  `;
}

// 5-spoke alloy wheel with a concave dish look.
function wheel(cx: number, cy: number, r: number, id: string): string {
  const rimR = r * 0.74;
  const dishR = r * 0.58;
  const hubR = r * 0.18;
  // 5 spokes — angle offset 18° so the top of the rim shows two spokes
  // catching the light rather than a single dead-center spoke.
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
    <!-- Tire -->
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-tire)"/>
    <!-- Tire sidewall highlight -->
    <circle cx="${cx}" cy="${cy - r * 0.05}" r="${r * 0.93}" fill="none" stroke="#52525b" stroke-width="0.5" opacity="0.6"/>
    <!-- Outer rim ring -->
    <circle cx="${cx}" cy="${cy}" r="${rimR}" fill="url(#${id}-rim)"/>
    <!-- Concave dish (slightly darker) -->
    <circle cx="${cx}" cy="${cy}" r="${dishR}" fill="#71717a"/>
    <!-- 5 spokes -->
    ${spokes}
    <!-- Center hub -->
    <circle cx="${cx}" cy="${cy}" r="${hubR}" fill="#27272a"/>
    <circle cx="${cx}" cy="${cy}" r="${hubR * 0.55}" fill="#71717a"/>
    <!-- Rim hot-spot (top-left) — sells "polished aluminium" -->
    <ellipse cx="${cx - r * 0.2}" cy="${cy - r * 0.42}" rx="${r * 0.22}" ry="${r * 0.10}" fill="#ffffff" opacity="0.55"/>
  `;
}

// ─────────────────────────────────────────────────────────────────────────
// CAR — modern sedan/fastback profile, 3/4 view from above-rear.
// Inspired by Tesla Model 3 / Polestar 2 silhouettes.
// ─────────────────────────────────────────────────────────────────────────
function carSvg(): string {
  const id = 'car';
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="100%" height="100%">
  ${commonDefs(id)}

  <!-- Soft ground shadow under the whole car -->
  <ellipse cx="48" cy="87" rx="34" ry="4.2" fill="#000" opacity="0.32" filter="url(#${id}-floor)"/>

  <g filter="url(#${id}-soft)">
    <!-- Chassis underbody (visible as a dark band beneath the paint) -->
    <path d="M16 28 Q15 24 18 22 L78 22 Q81 24 80 28 L80 70 Q81 76 75 78 L21 78 Q15 76 16 70 Z"
          fill="#1c1130"/>

    <!-- Wheels first (so body sits on top, creating wheel-well overlap) -->
    ${wheel(22, 30, 7.6, id)}
    ${wheel(74, 30, 7.6, id)}
    ${wheel(22, 64, 8, id)}
    ${wheel(74, 64, 8, id)}

    <!-- Wheel-well shadows -->
    <circle cx="22" cy="30" r="9.5" fill="url(#${id}-well)"/>
    <circle cx="74" cy="30" r="9.5" fill="url(#${id}-well)"/>
    <circle cx="22" cy="64" r="10" fill="url(#${id}-well)"/>
    <circle cx="74" cy="64" r="10" fill="url(#${id}-well)"/>

    <!-- MAIN BODY — modern fastback silhouette using Bézier curves -->
    <!--
      Path walk: start front-left fender, curve over hood to front-right
      fender, down the right side with a subtle door crease bulge, around
      the rear bumper, back up the left side mirroring the right.
    -->
    <path d="
      M 30 14
      Q 32 9 38 9
      L 58 9
      Q 64 9 66 14
      L 70 22
      Q 72 24 72 28
      L 76 30
      Q 80 32 80 38
      L 80 60
      Q 80 66 76 68
      L 72 70
      Q 72 74 70 78
      L 66 84
      Q 64 87 58 87
      L 38 87
      Q 32 87 30 84
      L 26 78
      Q 24 74 24 70
      L 20 68
      Q 16 66 16 60
      L 16 38
      Q 16 32 20 30
      L 24 28
      Q 24 24 26 22
      L 30 14
      Z" fill="url(#${id}-paint)"/>

    <!-- Side-rim light overlay (left bright, right shadow) -->
    <path d="
      M 30 14
      Q 32 9 38 9
      L 58 9
      Q 64 9 66 14
      L 70 22
      Q 72 24 72 28
      L 76 30
      Q 80 32 80 38
      L 80 60
      Q 80 66 76 68
      L 72 70
      Q 72 74 70 78
      L 66 84
      Q 64 87 58 87
      L 38 87
      Q 32 87 30 84
      L 26 78
      Q 24 74 24 70
      L 20 68
      Q 16 66 16 60
      L 16 38
      Q 16 32 20 30
      L 24 28
      Q 24 24 26 22
      L 30 14
      Z" fill="url(#${id}-rim-light)"/>

    <!-- Hood crease line (long subtle highlight along the centerline) -->
    <path d="M 48 12 L 48 22" stroke="#ede9fe" stroke-width="0.4" opacity="0.55"/>

    <!-- Front bumper accent band -->
    <rect x="34" y="11.5" width="28" height="1.2" rx="0.6" fill="#ffffff" opacity="0.7"/>

    <!-- WINDSHIELD (front) — trapezoid with sky-blue gradient -->
    <path d="M 30 26 L 66 26 L 60 40 L 36 40 Z" fill="url(#${id}-glass)"/>
    <!-- Windshield wiper rest -->
    <rect x="36" y="39.5" width="24" height="0.6" fill="#0c1a4d" opacity="0.7"/>
    <!-- A-pillar shadow -->
    <line x1="30" y1="26" x2="36" y2="40" stroke="#1e1b4b" stroke-width="0.8"/>
    <line x1="66" y1="26" x2="60" y2="40" stroke="#1e1b4b" stroke-width="0.8"/>

    <!-- ROOF — sleeker than a box: subtle curve top edge with highlight -->
    <path d="M 36 40 L 60 40 L 60 56 L 36 56 Z" fill="#1e1b4b" opacity="0.55"/>
    <rect x="38" y="41" width="20" height="2" rx="1" fill="#ffffff" opacity="0.4"/>

    <!-- REAR WINDSHIELD — fastback slope -->
    <path d="M 36 56 L 60 56 L 64 70 L 32 70 Z" fill="url(#${id}-glass)"/>
    <line x1="36" y1="56" x2="32" y2="70" stroke="#1e1b4b" stroke-width="0.8"/>
    <line x1="60" y1="56" x2="64" y2="70" stroke="#1e1b4b" stroke-width="0.8"/>

    <!-- Door character line (long horizontal crease in the paint) -->
    <path d="M 18 48 Q 48 50 78 48" stroke="#1e1b4b" stroke-width="0.6" fill="none" opacity="0.55"/>
    <!-- And the highlight directly above it (sells the metal sheet) -->
    <path d="M 18 47 Q 48 49 78 47" stroke="#ede9fe" stroke-width="0.4" fill="none" opacity="0.45"/>

    <!-- Mirrors (one each side, just outside the windshield) -->
    <ellipse cx="28" cy="30" rx="2.6" ry="1.6" fill="#3b3b54"/>
    <ellipse cx="27.6" cy="29.3" rx="1.8" ry="0.7" fill="#ffffff" opacity="0.45"/>
    <ellipse cx="68" cy="30" rx="2.6" ry="1.6" fill="#3b3b54"/>
    <ellipse cx="67.6" cy="29.3" rx="1.8" ry="0.7" fill="#ffffff" opacity="0.45"/>

    <!-- LED headlight signature — modern Y-shaped DRL strip per side -->
    <!-- Left headlight -->
    <path d="M 22 14 Q 24 13 28 14 L 30 18 Q 28 19 25 18.5 L 22 18 Z" fill="url(#${id}-led)"/>
    <ellipse cx="25" cy="15.5" rx="3" ry="1" fill="#ffffff" opacity="0.9"/>
    <!-- Right headlight -->
    <path d="M 74 14 Q 72 13 68 14 L 66 18 Q 68 19 71 18.5 L 74 18 Z" fill="url(#${id}-led)"/>
    <ellipse cx="71" cy="15.5" rx="3" ry="1" fill="#ffffff" opacity="0.9"/>

    <!-- Front grille hint (subtle dark slit) -->
    <rect x="38" y="11" width="20" height="0.8" rx="0.4" fill="#0c0a1a" opacity="0.8"/>

    <!-- TAIL-LIGHTS — full-width LED bar across the rear (modern EV signature) -->
    <rect x="22" y="80" width="52" height="1.6" rx="0.8" fill="url(#${id}-tail)"/>
    <rect x="22" y="80" width="52" height="0.6" rx="0.3" fill="#fecaca" opacity="0.9"/>
    <!-- Tail-light caps at each end -->
    <ellipse cx="22" cy="80.8" rx="2.2" ry="1.2" fill="#ef4444"/>
    <ellipse cx="74" cy="80.8" rx="2.2" ry="1.2" fill="#ef4444"/>

    <!-- Subtle direction notch on the hood (front of vehicle) -->
    <path d="M 48 5 L 51 9 L 45 9 Z" fill="#ede9fe" opacity="0.9"/>
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
    <path d="M 32 38 Q 32 34 36 34 L 60 34 Q 64 34 64 38 L 64 70 Q 64 74 60 74 L 36 74 Q 32 74 32 70 Z"
          fill="url(#${id}-rim-light)"/>

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
    <rect x="44.5" y="14" width="7" height="20" fill="url(#${id}-rim-light)"/>
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

    <!-- Brake lever (small detail off the handlebar) -->
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

    <!-- Brake calipers (tiny detail near each hub) -->
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
