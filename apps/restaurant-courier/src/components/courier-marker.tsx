/**
 * CourierMarker — HIR Curier (Design 3 · Premium)
 * ------------------------------------------------------------------
 * Marker pentru poziția live a curierului pe hartă (Mapbox GL / Google Maps / Leaflet).
 *
 *  - 3 vehicule: bike | moto | car
 *  - 2 stări:    online (violet brand, halo + wedge directional + puls)
 *                offline (gri neutru, șters)
 *  - heading (grade): rotește wedge-ul directional după direcția de mers.
 *
 * SURSA DE ADEVAR VIZUALA. Geometria SVG (path-uri, coordonate, viewBox 64x80)
 * este validată vizual și NU trebuie modificată. A schimba coordonatele,
 * scale-ul (FIT) sau path-urile = a strica markerul.
 *
 * Anchor pe hartă: 'bottom' (vârful de jos al pinului = poziția reală).
 *
 * Sursă: single source of truth pentru marker-ul de curier live
 * (tracking page customer + dispatch admin + fleet live map).
 */

import React from 'react';

export type Vehicle = 'bike' | 'moto' | 'car';
export type CourierStatus = 'online' | 'offline';

export interface CourierMarkerProps {
  vehicle: Vehicle;
  status?: CourierStatus;
  /** Direcția de mers în grade (0 = sus / nord). Rotește wedge-ul. */
  heading?: number;
  /** Puls animat pe online. Default true. Dezactivează-l când randezi >10 markere simultan. */
  animate?: boolean;
  /** Lățime randată în px. Default 64. Înălțimea se calculează proporțional. */
  size?: number;
  /** Override culoare brand principală (online). Default #7C5CFF. */
  brandColor?: string;
  className?: string;
}

/* ---- Palete (online / offline) ---- */
const PALETTE = {
  online: { c: '#7C5CFF', c2: '#9D7CFF', cd: '#5B3FE0' },
  offline: { c: '#3A3F4B', c2: '#4A505C', cd: '#2A2F38' },
} as const;

/* ---- Iconuri Tabler (filled, MIT). NU modifica path-urile. ---- */
const ICONS: Record<Vehicle, React.ReactNode> = {
  bike: (
    <>
      <path d="M5 14a4 4 0 1 1 -4 4l.005 -.2a4 4 0 0 1 3.995 -3.8" />
      <path d="M19 14a4 4 0 1 1 -4 4l.005 -.2a4 4 0 0 1 3.995 -3.8" />
      <path d="M14.832 7.445l1.703 2.555h2.465a1 1 0 0 1 .993 .883l.007 .117a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -.832 -.445l-1.396 -2.093l-3.275 2.62l2.21 2.21a1 1 0 0 1 .284 .577l.009 .131v4a1 1 0 0 1 -2 0v-3.585l-2.707 -2.708a1 1 0 0 1 -.01 -1.403l.092 -.085l5 -4a1 1 0 0 1 1.457 .226" />
      <path d="M17 3a2 2 0 1 1 -2 2l.005 -.15a2 2 0 0 1 1.995 -1.85" />
    </>
  ),
  moto: (
    <path d="M15 5a1 1 0 0 1 .894 .553l3.225 6.449l.08 .003a4 4 0 1 1 -4.199 3.995l.005 -.2a4 4 0 0 1 2.111 -3.33l-.557 -1.115l-3.352 3.352a1 1 0 0 1 -.707 .293h-3.626q .124 .481 .126 1a4 4 0 1 1 -8 0l.005 -.2a4 4 0 0 1 6.33 -3.049l1.749 -1.751h-3.084a1 1 0 0 1 -.993 -.883l-.007 -.117a1 1 0 0 1 1 -1h9.381l-1 -2h-1.381a1 1 0 0 1 -.993 -.883l-.007 -.117a1 1 0 0 1 1 -1z" />
  ),
  car: (
    <path d="M14 5a1 1 0 0 1 .694 .28l.087 .095l3.699 4.625h.52a3 3 0 0 1 2.995 2.824l.005 .176v4a1 1 0 0 1 -1 1h-1.171a3.001 3.001 0 0 1 -5.658 0h-4.342a3.001 3.001 0 0 1 -5.658 0h-1.171a1 1 0 0 1 -1 -1v-6l.007 -.117l.008 -.056l.017 -.078l.012 -.036l.014 -.05l2.014 -5.034a1 1 0 0 1 .928 -.629zm-7 11a1 1 0 1 0 0 2a1 1 0 0 0 0 -2m10 0a1 1 0 1 0 0 2a1 1 0 0 0 0 -2m-6 -9h-5.324l-1.2 3h6.524zm2.52 0h-.52v3h2.92z" />
  ),
};

/* ---- Scale per icon (centrare vizuală în disc). NU modifica. ---- */
const FIT: Record<Vehicle, number> = { bike: 1.12, moto: 1.12, car: 1.15 };

export default function CourierMarker({
  vehicle,
  status = 'online',
  heading = 0,
  animate = true,
  size = 64,
  brandColor,
  className,
}: CourierMarkerProps) {
  if (!['bike', 'moto', 'car'].includes(vehicle)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`CourierMarker: vehicul necunoscut "${vehicle}"`);
    }
    return null;
  }

  const on = status === 'online';
  const pal = on ? PALETTE.online : PALETTE.offline;
  const c = on ? brandColor ?? pal.c : pal.c;
  const c2 = pal.c2;
  const cd = pal.cd;

  const uid = `${vehicle}_${status}`;
  const h = (size / 64) * 80;
  const f = FIT[vehicle];

  const CX = 32,
    CY = 30,
    R = 22;
  const tx = CX - 12 * f,
    ty = CY - 12 * f;
  const pinTail = `M${CX} 74 C${CX - 5} 64 ${CX - 12} 58 ${CX - 12} ${CY + 8} a12 12 0 0 1 24 0 C${CX + 12} 58 ${CX + 5} 64 ${CX} 74 Z`;
  const wedge = `M${CX - 7} ${CY - R - 2} L${CX} ${CY - R - 9} L${CX + 7} ${CY - R - 2} Z`;
  const showPulse = on && animate;

  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 64 80"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`curier ${vehicle} ${status}`}
      className={className}
    >
      <defs>
        <linearGradient
          id={`bg_${uid}`}
          x1={CX}
          y1={CY - R}
          x2={CX}
          y2={CY + R}
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={c2} />
          <stop offset="1" stopColor={cd} />
        </linearGradient>
        <radialGradient id={`hl_${uid}`} cx="0.35" cy="0.28" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity={on ? 0.42 : 0.16} />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`inner_${uid}`} cx="0.5" cy="0.62" r="0.6">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </radialGradient>
        <filter id={`sh_${uid}`} x="-70%" y="-20%" width="240%" height="180%">
          <feDropShadow
            dx="0"
            dy="6"
            stdDeviation="5"
            floodColor="#000"
            floodOpacity={on ? 0.42 : 0.26}
          />
        </filter>
      </defs>

      {showPulse && (
        <>
          <circle
            cx={CX}
            cy={CY}
            r="18"
            fill={c}
            style={{
              transformOrigin: `${CX}px ${CY}px`,
              animation: 'hirPulse 2.2s ease-out infinite',
            }}
          />
          <circle
            cx={CX}
            cy={CY}
            r="18"
            fill={c2}
            style={{
              transformOrigin: `${CX}px ${CY}px`,
              animation: 'hirPulse2 2.2s ease-out infinite .6s',
            }}
          />
        </>
      )}

      <path filter={`url(#sh_${uid})`} d={pinTail} fill={cd} />

      {on && (
        <g transform={`rotate(${heading} ${CX} ${CY})`}>
          <path d={wedge} fill={c2} />
        </g>
      )}

      <circle cx={CX} cy={CY} r={R + 3} fill={c} opacity={on ? 0.22 : 0.12} />
      <circle cx={CX} cy={CY} r={R} fill={`url(#bg_${uid})`} filter={`url(#sh_${uid})`} />
      <circle cx={CX} cy={CY} r={R} fill={`url(#inner_${uid})`} />
      <circle
        cx={CX}
        cy={CY}
        r={R}
        fill="none"
        stroke="#fff"
        strokeOpacity={on ? 0.3 : 0.12}
        strokeWidth="1.5"
      />
      <circle cx={CX} cy={CY} r={R} fill={`url(#hl_${uid})`} />

      <g transform={`translate(${tx},${ty}) scale(${f})`} fill="#fff" opacity={on ? 1 : 0.9}>
        {ICONS[vehicle]}
      </g>

      {showPulse && (
        <style>{`@keyframes hirPulse{0%{opacity:.5;transform:scale(.8)}70%{opacity:0;transform:scale(2.6)}100%{opacity:0}}@keyframes hirPulse2{0%{opacity:.3;transform:scale(.9)}70%{opacity:0;transform:scale(2.1)}100%{opacity:0}}`}</style>
      )}
    </svg>
  );
}
