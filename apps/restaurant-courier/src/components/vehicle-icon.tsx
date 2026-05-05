// Top-down 3/4 miniature illustrations for the rider's own marker.
// All shapes are inline SVG so they scale crisply on retina + can be
// embedded into a Leaflet divIcon without a network round-trip.
//
// Design notes:
//   * Light source: upper-left. Highlights on the top edge, shadows on the
//     bottom-right. Gives the icons their "miniature 3D" feel.
//   * Each vehicle has a soft ground shadow drawn as a blurred ellipse
//     beneath, so the icon reads as a small object hovering over the map
//     (not stamped flat onto it).
//   * Default orientation: vehicle facing UP (north). The marker container
//     in `rider-map.tsx` rotates the whole icon by the live GPS heading
//     so the front always points where the rider is going.
//   * Palette is anchored on violet-500 (#8b5cf6) and violet-300 (#c4b5fd)
//     so it matches the rest of the app chrome.
//
// Public API:
//   - `vehicleIconHtml(type)` → string of `<svg>...</svg>` ready for
//     L.divIcon({ html }).
//   - `<VehicleIcon type=... size=... className=...>` for use in JSX
//     (settings preview, header, etc).

import type { CSSProperties } from 'react';

export type VehicleType = 'BIKE' | 'SCOOTER' | 'CAR';

const VIOLET_FILL = '#8b5cf6';
const VIOLET_DARK = '#6d28d9';
const VIOLET_LIGHT = '#c4b5fd';
const HIGHLIGHT = '#f5f3ff';
const TIRE = '#0f0f12';
const TIRE_RIM = '#3f3f46';

// Returns a self-contained SVG string. We inline gradient defs per call so
// the SVG stays portable when injected into Leaflet's divIcon HTML — Leaflet
// strips <defs> referenced from outside the icon's own DOM scope.
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
      // Inline SVG payload as innerHTML — same source the map uses, so the
      // settings preview is pixel-identical to the live marker.
      dangerouslySetInnerHTML={{ __html: vehicleIconHtml(type) }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Car — top-down with a slight tilt forward. Reads as a hatchback silhouette
// at small sizes. Gradient hood + windshield highlight + four wheels.
// ─────────────────────────────────────────────────────────────────────────
function carSvg(): string {
  const id = 'car';
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <defs>
    <linearGradient id="${id}-body" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="${VIOLET_LIGHT}"/>
      <stop offset="55%" stop-color="${VIOLET_FILL}"/>
      <stop offset="100%" stop-color="${VIOLET_DARK}"/>
    </linearGradient>
    <linearGradient id="${id}-glass" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#a5b4fc" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#312e81" stop-opacity="0.85"/>
    </linearGradient>
    <radialGradient id="${id}-shadow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- ground shadow -->
  <ellipse cx="32" cy="56" rx="20" ry="3.5" fill="url(#${id}-shadow)"/>
  <!-- wheels (drawn first so the body sits on top of them) -->
  <rect x="9" y="14" width="6" height="9" rx="1.5" fill="${TIRE}"/>
  <rect x="49" y="14" width="6" height="9" rx="1.5" fill="${TIRE}"/>
  <rect x="9" y="40" width="6" height="9" rx="1.5" fill="${TIRE}"/>
  <rect x="49" y="40" width="6" height="9" rx="1.5" fill="${TIRE}"/>
  <!-- body -->
  <rect x="13" y="8" width="38" height="48" rx="9" fill="url(#${id}-body)" stroke="${VIOLET_DARK}" stroke-width="0.6"/>
  <!-- front windshield (top) -->
  <path d="M17 14 L47 14 L43 22 L21 22 Z" fill="url(#${id}-glass)"/>
  <!-- rear windshield (bottom) -->
  <path d="M21 42 L43 42 L47 50 L17 50 Z" fill="url(#${id}-glass)"/>
  <!-- roof highlight -->
  <rect x="22" y="24" width="20" height="16" rx="2.5" fill="${VIOLET_LIGHT}" opacity="0.18"/>
  <!-- hood specular -->
  <rect x="22" y="9.5" width="6" height="2.2" rx="1" fill="${HIGHLIGHT}" opacity="0.55"/>
  <!-- headlights at top -->
  <circle cx="18.5" cy="12.5" r="1.4" fill="#fde68a"/>
  <circle cx="45.5" cy="12.5" r="1.4" fill="#fde68a"/>
  <!-- forward direction notch (the ▲ on the hood disambiguates which way is forward) -->
  <path d="M32 5 L36 10 L28 10 Z" fill="${HIGHLIGHT}" opacity="0.85"/>
</svg>`.trim();
}

// ─────────────────────────────────────────────────────────────────────────
// Scooter — top-down. Deck + steering column + handlebar + two wheels
// (front wheel slightly smaller, like a real kick scooter).
// ─────────────────────────────────────────────────────────────────────────
function scooterSvg(): string {
  const id = 'scooter';
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <defs>
    <linearGradient id="${id}-deck" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${VIOLET_LIGHT}"/>
      <stop offset="50%" stop-color="${VIOLET_FILL}"/>
      <stop offset="100%" stop-color="${VIOLET_DARK}"/>
    </linearGradient>
    <linearGradient id="${id}-bar" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${TIRE_RIM}"/>
      <stop offset="50%" stop-color="#71717a"/>
      <stop offset="100%" stop-color="${TIRE_RIM}"/>
    </linearGradient>
    <radialGradient id="${id}-shadow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- ground shadow -->
  <ellipse cx="32" cy="56" rx="14" ry="3" fill="url(#${id}-shadow)"/>
  <!-- back wheel + axle -->
  <rect x="29" y="46" width="6" height="10" rx="1.5" fill="${TIRE}"/>
  <ellipse cx="32" cy="51" rx="2" ry="2" fill="${TIRE_RIM}"/>
  <!-- deck -->
  <rect x="22" y="20" width="20" height="28" rx="6" fill="url(#${id}-deck)" stroke="${VIOLET_DARK}" stroke-width="0.6"/>
  <!-- grip pattern on deck -->
  <line x1="26" y1="26" x2="38" y2="26" stroke="${VIOLET_DARK}" stroke-width="0.5" opacity="0.6"/>
  <line x1="26" y1="30" x2="38" y2="30" stroke="${VIOLET_DARK}" stroke-width="0.5" opacity="0.6"/>
  <line x1="26" y1="34" x2="38" y2="34" stroke="${VIOLET_DARK}" stroke-width="0.5" opacity="0.6"/>
  <line x1="26" y1="38" x2="38" y2="38" stroke="${VIOLET_DARK}" stroke-width="0.5" opacity="0.6"/>
  <line x1="26" y1="42" x2="38" y2="42" stroke="${VIOLET_DARK}" stroke-width="0.5" opacity="0.6"/>
  <!-- steering column -->
  <rect x="30" y="12" width="4" height="10" rx="1" fill="${TIRE_RIM}"/>
  <!-- handlebar -->
  <rect x="20" y="10" width="24" height="3.5" rx="1.7" fill="url(#${id}-bar)"/>
  <circle cx="20" cy="11.7" r="2" fill="${VIOLET_FILL}"/>
  <circle cx="44" cy="11.7" r="2" fill="${VIOLET_FILL}"/>
  <!-- front wheel -->
  <rect x="29" y="6" width="6" height="9" rx="1.5" fill="${TIRE}"/>
  <ellipse cx="32" cy="10.5" rx="1.7" ry="1.7" fill="${TIRE_RIM}"/>
  <!-- forward indicator (small light at the front edge) -->
  <circle cx="32" cy="5" r="1.4" fill="#fde68a"/>
</svg>`.trim();
}

// ─────────────────────────────────────────────────────────────────────────
// Bike — top-down. Two wheels with rims, frame between, handlebars at front,
// saddle at back. Smaller scale than scooter so it reads as "lighter".
// ─────────────────────────────────────────────────────────────────────────
function bikeSvg(): string {
  const id = 'bike';
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <defs>
    <linearGradient id="${id}-frame" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${VIOLET_LIGHT}"/>
      <stop offset="50%" stop-color="${VIOLET_FILL}"/>
      <stop offset="100%" stop-color="${VIOLET_DARK}"/>
    </linearGradient>
    <radialGradient id="${id}-shadow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-wheel" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${TIRE_RIM}"/>
      <stop offset="60%" stop-color="${TIRE}"/>
      <stop offset="100%" stop-color="${TIRE}"/>
    </radialGradient>
  </defs>
  <!-- ground shadow -->
  <ellipse cx="32" cy="56" rx="13" ry="2.6" fill="url(#${id}-shadow)"/>
  <!-- back wheel -->
  <circle cx="32" cy="48" r="9" fill="url(#${id}-wheel)" stroke="${TIRE_RIM}" stroke-width="0.6"/>
  <circle cx="32" cy="48" r="3.2" fill="${TIRE_RIM}"/>
  <line x1="32" y1="40" x2="32" y2="56" stroke="${HIGHLIGHT}" stroke-width="0.4" opacity="0.4"/>
  <line x1="24" y1="48" x2="40" y2="48" stroke="${HIGHLIGHT}" stroke-width="0.4" opacity="0.4"/>
  <!-- frame: top tube + down tube + seat tube -->
  <line x1="32" y1="20" x2="32" y2="48" stroke="url(#${id}-frame)" stroke-width="3.2" stroke-linecap="round"/>
  <line x1="32" y1="32" x2="40" y2="48" stroke="url(#${id}-frame)" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="32" y1="20" x2="24" y2="16" stroke="url(#${id}-frame)" stroke-width="2.4" stroke-linecap="round"/>
  <!-- saddle -->
  <ellipse cx="32" cy="34" rx="3.2" ry="1.6" fill="#1f1f24" stroke="${VIOLET_DARK}" stroke-width="0.6"/>
  <!-- front wheel -->
  <circle cx="32" cy="16" r="8" fill="url(#${id}-wheel)" stroke="${TIRE_RIM}" stroke-width="0.6"/>
  <circle cx="32" cy="16" r="2.8" fill="${TIRE_RIM}"/>
  <line x1="32" y1="9" x2="32" y2="23" stroke="${HIGHLIGHT}" stroke-width="0.4" opacity="0.4"/>
  <line x1="25" y1="16" x2="39" y2="16" stroke="${HIGHLIGHT}" stroke-width="0.4" opacity="0.4"/>
  <!-- handlebar across the front wheel -->
  <rect x="22" y="10.5" width="20" height="2.6" rx="1.3" fill="${TIRE_RIM}"/>
  <circle cx="22" cy="11.8" r="1.7" fill="${VIOLET_FILL}"/>
  <circle cx="42" cy="11.8" r="1.7" fill="${VIOLET_FILL}"/>
  <!-- forward light -->
  <circle cx="32" cy="6" r="1.3" fill="#fde68a"/>
</svg>`.trim();
}
