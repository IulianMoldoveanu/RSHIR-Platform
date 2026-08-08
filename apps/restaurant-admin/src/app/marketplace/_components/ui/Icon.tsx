// B2B Marketplace (admin / light) — inline stroke-SVG icon set.
//
// One `<Icon name=…/>` component, a single switch over the named glyph set
// used across the marketplace surface. Replaces the decorative emoji in the
// owner-approved preview (📦📍🕐💰🏆⭐🛡️💡 …) with crisp inline strokes.
//
// Discipline (spec §1.6): currentColor, fill="none", strokeWidth 1.75,
// round caps/joins, viewBox 0 0 24 24, default 16px (h-4 w-4). Decorative by
// default (aria-hidden + focusable=false); pass `title` to make it an
// accessible image with a <title>.
//
// Courier keeps lucide-react — do NOT import this module on the dark side.

import * as React from 'react';
import { cn } from '@hir/ui';

export type IconName =
  | 'plus'
  | 'arrow-right'
  | 'arrow-left'
  | 'map-pin'
  | 'package'
  | 'clock'
  | 'wallet'
  | 'gavel'
  | 'check-circle'
  | 'star'
  | 'truck'
  | 'search'
  | 'shield'
  | 'info'
  | 'x'
  | 'thermometer'
  | 'file-search'
  | 'banknote'
  | 'trophy';

export interface IconProps {
  name: IconName;
  className?: string;
  title?: string;
}

function paths(name: IconName): React.ReactNode {
  switch (name) {
    case 'plus':
      return <path d="M12 5v14M5 12h14" />;
    case 'arrow-right':
      return <path d="M5 12h14M13 6l6 6-6 6" />;
    case 'arrow-left':
      return <path d="M19 12H5M11 18l-6-6 6-6" />;
    case 'map-pin':
      return (
        <>
          <path d="M20 10c0 5.5-8 12-8 12s-8-6.5-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </>
      );
    case 'package':
      return (
        <>
          <path d="M16.5 9.4 7.5 4.21M3 7.5l9 5.2 9-5.2M12 21V12.7" />
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        </>
      );
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      );
    case 'wallet':
      return (
        <>
          <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3" />
          <path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" />
          <path d="M20 11h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1Z" />
        </>
      );
    case 'gavel':
      return (
        <>
          <path d="m14.5 12.5-8 8a2.12 2.12 0 0 1-3-3l8-8" />
          <path d="m16 16 6-6M8 8l6-6M9 7l8 8M21 11l-8-8" />
          <path d="M3 21h9" />
        </>
      );
    case 'check-circle':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12 2.5 2.5 4.5-5" />
        </>
      );
    case 'star':
      return (
        <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.77l-5.2 2.74.99-5.79-4.21-4.1 5.82-.85L12 3.5Z" />
      );
    case 'truck':
      return (
        <>
          <path d="M3 6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v9H3Z" />
          <path d="M15 8h3.5a1 1 0 0 1 .82.43L21 11v4h-6" />
          <circle cx="7" cy="18" r="1.8" />
          <circle cx="17" cy="18" r="1.8" />
        </>
      );
    case 'search':
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </>
      );
    case 'shield':
      return <path d="M12 3 5 6v5c0 4.4 3 8 7 9 4-1 7-4.6 7-9V6l-7-3Z" />;
    case 'info':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 7.5h.01" />
        </>
      );
    case 'x':
      return <path d="M6 6l12 12M18 6 6 18" />;
    case 'thermometer':
      return <path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0Z" />;
    case 'file-search':
      return (
        <>
          <path d="M14 3v4a1 1 0 0 0 1 1h4" />
          <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7Z" />
          <circle cx="11.5" cy="13.5" r="2.5" />
          <path d="m14 16 1.5 1.5" />
        </>
      );
    case 'banknote':
      return (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M6 9h.01M18 15h.01" />
        </>
      );
    case 'trophy':
      return (
        <>
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
          <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
          <path d="M10 14.5V18M14 14.5V18M8 21h8M9 18h6" />
        </>
      );
  }
}

export function Icon({ name, className, title }: IconProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-4 w-4', className)}
      aria-hidden={title ? undefined : true}
      focusable="false"
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {paths(name)}
    </svg>
  );
}
