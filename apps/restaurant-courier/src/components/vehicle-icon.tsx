// Modern 3D-illustration markers for the rider's own pin on the live map.
// Complete redesign of the previous flat top-down icons.
//
// Design approach (after first cut was rejected as 'extrem de facil si
// neplacut'):
//   * 3/4 isometric perspective (looking from rear-above, ~30° tilt) so
//     the silhouette reads as a real vehicle, not a logo.
//   * Multi-stop linear gradients on every body panel — top edge bright,
//     bottom edge dark — to fake studio lighting.
//   * SVG <filter> drop shadows (feGaussianBlur) instead of plain ellipses;
//     gives a soft, modern "icon hovering over a surface" look akin to
//     3dicons.co / Apple Maps style.
//   * Specular highlights as small light-blue rounded rects on the top of
//     each surface, faintly visible — sells the "shiny" feel without
//     overdoing it.
//   * Wheels have rim spokes + tire wall + center hub (3 layers each).
//   * Front-facing direction is UP in the artwork; the marker container
//     in rider-map.tsx rotates the whole element by the live GPS heading,
//     so the front always points where the rider is going.
//
// Public API:
//   - `vehicleIconHtml(type)` → string of `<svg>...</svg>` for L.divIcon.
//   - `<VehicleIcon type=... size=... />` for use in JSX previews.
//
// Color anchors stay on violet (HIR brand) but each panel gets a 3-stop
// gradient between #ede9fe (top highlight), #8b5cf6 (mid), #4c1d95 (deep
// shadow). Tires + glass + lights have their own palettes.

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
// Shared <defs>: gradients + a soft drop shadow filter. Kept inline per icon
// (not extracted) so each SVG payload is self-contained when injected as a
// Leaflet divIcon — the filter cannot reference an id outside its own DOM.
// ─────────────────────────────────────────────────────────────────────────
function commonDefs(id: string): string {
  return `
    <defs>
      <filter id="${id}-drop" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2.2"/>
        <feOffset dx="0" dy="2.4" result="off"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <linearGradient id="${id}-body" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%"  stop-color="#ede9fe"/>
        <stop offset="35%" stop-color="#a78bfa"/>
        <stop offset="70%" stop-color="#7c3aed"/>
        <stop offset="100%" stop-color="#4c1d95"/>
      </linearGradient>
      <linearGradient id="${id}-side" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"  stop-color="#ede9fe" stop-opacity="0.6"/>
        <stop offset="50%" stop-color="#ffffff" stop-opacity="0.0"/>
        <stop offset="100%" stop-color="#1e1b4b" stop-opacity="0.55"/>
      </linearGradient>
      <linearGradient id="${id}-glass" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#dbeafe"/>
        <stop offset="55%" stop-color="#60a5fa"/>
        <stop offset="100%" stop-color="#1e3a8a"/>
      </linearGradient>
      <radialGradient id="${id}-tire" cx="35%" cy="30%" r="70%">
        <stop offset="0%"  stop-color="#52525b"/>
        <stop offset="55%" stop-color="#27272a"/>
        <stop offset="100%" stop-color="#09090b"/>
      </radialGradient>
      <radialGradient id="${id}-rim" cx="50%" cy="50%" r="55%">
        <stop offset="0%"  stop-color="#e4e4e7"/>
        <stop offset="60%" stop-color="#a1a1aa"/>
        <stop offset="100%" stop-color="#52525b"/>
      </radialGradient>
      <radialGradient id="${id}-headlight" cx="50%" cy="50%" r="50%">
        <stop offset="0%"  stop-color="#fffbeb"/>
        <stop offset="50%" stop-color="#fde68a"/>
        <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.0"/>
      </radialGradient>
    </defs>
  `;
}

// Reusable wheel block — drawn as 3 stacked circles + spokes.
function wheel(cx: number, cy: number, r: number, id: string): string {
  const rimR = r * 0.62;
  const hubR = r * 0.22;
  const sp = (angleDeg: number) => {
    const a = (angleDeg * Math.PI) / 180;
    return `${cx + Math.cos(a) * rimR},${cy + Math.sin(a) * rimR}`;
  };
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-tire)"/>
    <circle cx="${cx}" cy="${cy}" r="${rimR}" fill="url(#${id}-rim)"/>
    ${[0, 60, 120, 180, 240, 300]
      .map((a) => `<line x1="${cx}" y1="${cy}" x2="${sp(a)}" stroke="#52525b" stroke-width="0.7" opacity="0.6"/>`)
      .join('')}
    <circle cx="${cx}" cy="${cy}" r="${hubR}" fill="#27272a"/>
    <circle cx="${cx - r * 0.18}" cy="${cy - r * 0.22}" r="${r * 0.12}" fill="#ffffff" opacity="0.18"/>
  `;
}

// ─────────────────────────────────────────────────────────────────────────
// CAR — 3/4 isometric. Trunk at bottom, hood at top. Roof + windshield
// + 4 wheels visible at corners. Headlight + tail-light detail.
// ─────────────────────────────────────────────────────────────────────────
function carSvg(): string {
  const id = 'car';
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="100%" height="100%">
  ${commonDefs(id)}
  <!-- Ground shadow (soft, blurred ellipse beneath) -->
  <ellipse cx="48" cy="86" rx="30" ry="4" fill="#000" opacity="0.32"/>
  <g filter="url(#${id}-drop)">
    <!-- 4 wheels (corners) — drawn first so the body sits on top of them -->
    ${wheel(20, 28, 7, id)}
    ${wheel(76, 28, 7, id)}
    ${wheel(20, 64, 7.5, id)}
    ${wheel(76, 64, 7.5, id)}
    <!-- Lower body (chassis), darker, slightly wider than the cabin -->
    <rect x="14" y="22" width="68" height="50" rx="14" fill="#1e1b4b"/>
    <!-- Main body — cabin shape -->
    <path d="M22 18 Q22 12 30 12 L66 12 Q74 12 74 18 L74 78 Q74 84 66 84 L30 84 Q22 84 22 78 Z"
          fill="url(#${id}-body)"/>
    <!-- Side gradient overlay (light↔shadow across X) -->
    <path d="M22 18 Q22 12 30 12 L66 12 Q74 12 74 18 L74 78 Q74 84 66 84 L30 84 Q22 84 22 78 Z"
          fill="url(#${id}-side)"/>
    <!-- Front windshield -->
    <path d="M28 22 L68 22 L62 36 L34 36 Z" fill="url(#${id}-glass)"/>
    <line x1="48" y1="22" x2="48" y2="36" stroke="#1e3a8a" stroke-width="0.6" opacity="0.6"/>
    <!-- Rear windshield -->
    <path d="M34 64 L62 64 L68 78 L28 78 Z" fill="url(#${id}-glass)" opacity="0.92"/>
    <!-- Roof highlight (specular reflection) -->
    <rect x="34" y="40" width="28" height="20" rx="3" fill="#ede9fe" opacity="0.18"/>
    <rect x="36" y="42" width="14" height="3" rx="1.5" fill="#ffffff" opacity="0.45"/>
    <!-- Hood specular streak (top edge highlight) -->
    <rect x="32" y="13.5" width="32" height="2" rx="1" fill="#ffffff" opacity="0.55"/>
    <!-- Headlights -->
    <circle cx="28" cy="17" r="3.5" fill="url(#${id}-headlight)"/>
    <circle cx="28" cy="17" r="1.6" fill="#fffbeb"/>
    <circle cx="68" cy="17" r="3.5" fill="url(#${id}-headlight)"/>
    <circle cx="68" cy="17" r="1.6" fill="#fffbeb"/>
    <!-- Tail-lights -->
    <rect x="26" y="78" width="8" height="2.4" rx="1" fill="#dc2626"/>
    <rect x="62" y="78" width="8" height="2.4" rx="1" fill="#dc2626"/>
    <!-- Direction notch on the hood (subtle ▲) -->
    <path d="M48 6 L52 11 L44 11 Z" fill="#ede9fe" opacity="0.85"/>
  </g>
</svg>`.trim();
}

// ─────────────────────────────────────────────────────────────────────────
// SCOOTER — 3/4 view. Deck + steering column + handlebar + 2 wheels.
// More vertical proportions than the car so silhouettes read distinctly.
// ─────────────────────────────────────────────────────────────────────────
function scooterSvg(): string {
  const id = 'scooter';
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="100%" height="100%">
  ${commonDefs(id)}
  <ellipse cx="48" cy="86" rx="22" ry="3.4" fill="#000" opacity="0.32"/>
  <g filter="url(#${id}-drop)">
    <!-- Rear wheel -->
    ${wheel(48, 76, 8, id)}
    <!-- Deck -->
    <rect x="32" y="36" width="32" height="36" rx="8" fill="url(#${id}-body)"/>
    <rect x="32" y="36" width="32" height="36" rx="8" fill="url(#${id}-side)"/>
    <!-- Grip-tape on deck (small dot pattern) -->
    ${[0, 1, 2, 3, 4, 5]
      .flatMap((row) =>
        [0, 1, 2, 3, 4].map(
          (col) =>
            `<circle cx="${36 + col * 6}" cy="${42 + row * 5}" r="0.7" fill="#1e1b4b" opacity="0.5"/>`,
        ),
      )
      .join('')}
    <!-- Highlight on top edge of deck -->
    <rect x="34" y="37" width="28" height="1.6" rx="0.8" fill="#ffffff" opacity="0.5"/>
    <!-- Steering column (rises from deck up to handlebar) -->
    <path d="M44 36 L42 18 Q42 14 46 14 L50 14 Q54 14 54 18 L52 36 Z"
          fill="url(#${id}-body)"/>
    <rect x="44" y="14" width="8" height="22" fill="url(#${id}-side)"/>
    <!-- Handlebar grips -->
    <rect x="22" y="12" width="52" height="5" rx="2.5" fill="#27272a"/>
    <rect x="22" y="12" width="52" height="1.6" rx="0.8" fill="#ffffff" opacity="0.35"/>
    <circle cx="22" cy="14.5" r="3" fill="url(#${id}-body)"/>
    <circle cx="22" cy="14.5" r="3" fill="url(#${id}-side)"/>
    <circle cx="74" cy="14.5" r="3" fill="url(#${id}-body)"/>
    <circle cx="74" cy="14.5" r="3" fill="url(#${id}-side)"/>
    <!-- Front wheel (smaller, like a real kick scooter) -->
    ${wheel(48, 22, 5.5, id)}
    <!-- Headlight cluster -->
    <ellipse cx="48" cy="10" rx="3.5" ry="2.4" fill="url(#${id}-headlight)"/>
    <circle cx="48" cy="10" r="1.4" fill="#fffbeb"/>
  </g>
</svg>`.trim();
}

// ─────────────────────────────────────────────────────────────────────────
// BIKE — 3/4 view. Two big wheels, frame triangle, saddle, handlebars.
// More airy than the scooter (no deck) so it reads as "lighter".
// ─────────────────────────────────────────────────────────────────────────
function bikeSvg(): string {
  const id = 'bike';
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="100%" height="100%">
  ${commonDefs(id)}
  <ellipse cx="48" cy="86" rx="22" ry="3.2" fill="#000" opacity="0.30"/>
  <g filter="url(#${id}-drop)">
    <!-- Rear wheel -->
    ${wheel(48, 70, 12, id)}
    <!-- Frame: down-tube + seat-tube + chain-stay -->
    <path d="M48 70 L48 36" stroke="url(#${id}-body)" stroke-width="5.5" stroke-linecap="round"/>
    <path d="M48 36 L40 22" stroke="url(#${id}-body)" stroke-width="4" stroke-linecap="round"/>
    <path d="M48 36 L62 70" stroke="url(#${id}-body)" stroke-width="4" stroke-linecap="round"/>
    <!-- Frame highlight strokes (specular) -->
    <path d="M48 70 L48 36" stroke="#ede9fe" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
    <!-- Saddle (3D pill) -->
    <ellipse cx="48" cy="36" rx="6" ry="2.4" fill="#1e1b4b"/>
    <ellipse cx="48" cy="35.4" rx="5.4" ry="1.5" fill="#3b3b54"/>
    <ellipse cx="46" cy="34.8" rx="2.2" ry="0.7" fill="#ffffff" opacity="0.3"/>
    <!-- Front wheel -->
    ${wheel(48, 22, 11, id)}
    <!-- Handlebar -->
    <rect x="26" y="14" width="44" height="3.6" rx="1.8" fill="#27272a"/>
    <rect x="26" y="14" width="44" height="1.2" rx="0.6" fill="#ffffff" opacity="0.35"/>
    <circle cx="26" cy="15.8" r="2.4" fill="url(#${id}-body)"/>
    <circle cx="70" cy="15.8" r="2.4" fill="url(#${id}-body)"/>
    <!-- Stem connecting handlebar to front wheel -->
    <rect x="46" y="16" width="4" height="6" fill="#27272a"/>
    <!-- Headlight -->
    <circle cx="48" cy="10" r="2.6" fill="url(#${id}-headlight)"/>
    <circle cx="48" cy="10" r="1.1" fill="#fffbeb"/>
  </g>
</svg>`.trim();
}
