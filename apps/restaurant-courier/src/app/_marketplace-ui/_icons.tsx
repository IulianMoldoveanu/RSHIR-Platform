// B2B Marketplace (courier dark theme) — internal inline SVG icon set.
//
// Crisp stroke icons used by the local design primitives so the primitives
// stay self-contained (no per-call lucide import inside a Card/RouteSteps).
// This is NOT the admin `Icon` module and is NOT exported from the barrel:
// pages on the courier side keep using lucide-react directly (lucide is
// stroke-based + currentColor and satisfies the icon rule). These glyphs
// match the admin named set so the two themes read identically.
//
// All glyphs: viewBox 0 0 24 24, fill none, stroke currentColor,
// strokeWidth 1.75, round caps/joins. Decorative by default (aria-hidden).

import * as React from 'react';

export type MarketplaceIconName =
  | 'package'
  | 'truck'
  | 'clock'
  | 'mapPin'
  | 'check'
  | 'x'
  | 'plus'
  | 'arrowRight'
  | 'store'
  | 'pill'
  | 'alertTriangle'
  | 'star';

const PATHS: Record<MarketplaceIconName, React.ReactNode> = {
  package: (
    <>
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </>
  ),
  truck: (
    <>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  mapPin: (
    <>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  plus: (
    <>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
  store: (
    <>
      <path d="M2 7 4 4h16l2 3" />
      <path d="M4 7v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7" />
      <path d="M2 7a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  pill: (
    <>
      <path d="M10.5 20.5 3.5 13.5a4.95 4.95 0 1 1 7-7l7 7a4.95 4.95 0 1 1-7 7Z" />
      <path d="m8.5 8.5 7 7" />
    </>
  ),
  alertTriangle: (
    <>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  star: (
    <path d="M11.05 3.69a1.06 1.06 0 0 1 1.9 0l2.2 4.46 4.92.72a1.06 1.06 0 0 1 .59 1.8l-3.56 3.47.84 4.9a1.06 1.06 0 0 1-1.54 1.12L12 17.77l-4.4 2.31a1.06 1.06 0 0 1-1.54-1.11l.84-4.9-3.56-3.48a1.06 1.06 0 0 1 .59-1.8l4.92-.72Z" />
  ),
};

export interface MarketplaceIconProps {
  name: MarketplaceIconName;
  className?: string;
  title?: string;
}

export function MarketplaceIcon({ name, className, title }: MarketplaceIconProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={['h-4 w-4', className ?? ''].filter(Boolean).join(' ')}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}
