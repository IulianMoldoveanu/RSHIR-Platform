// B2B Marketplace — empty-state card.
//
// Stream 7/9 (shared UI). Thin wrapper over @hir/ui's <EmptyState/> that
// supplies a marketplace-themed inline SVG (no external asset), a sensible
// default headline, and forwards the caller's CTA. Centralising this lets
// every "no listings / no offers / no matches" screen look identical.
//
// The SVG is purely decorative (aria-hidden) — the headline carries the
// semantics. Strokes are theme-neutral via `currentColor`, inheriting the
// parent text color (zinc-400 on admin's white surface, hir-muted-fg on
// courier's dark surface) so the illustration works in both apps without
// fork.

import * as React from 'react';
import { EmptyState } from '@hir/ui';

export interface EmptyMarketplaceStateProps {
  /** Headline. Defaults to "Niciun rezultat." */
  title?: string;
  /** Secondary description line. */
  description?: string;
  /** Optional CTA (button / link) — forwarded verbatim. */
  action?: React.ReactNode;
  /** Optional small hint line under the description. */
  hint?: string;
  className?: string;
}

function MarketplaceIllustration(): JSX.Element {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
    >
      {/* Storefront awning */}
      <path
        d="M8 18 L28 8 L48 18 V22 H8 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Storefront body */}
      <rect
        x="12"
        y="22"
        width="32"
        height="22"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Door */}
      <rect
        x="24"
        y="30"
        width="8"
        height="14"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Window left */}
      <rect
        x="16"
        y="26"
        width="6"
        height="4"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
      {/* Window right */}
      <rect
        x="34"
        y="26"
        width="6"
        height="4"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
      {/* Spark — emphasises "post a request" */}
      <path
        d="M44 8 L44 14 M41 11 L47 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EmptyMarketplaceState({
  title = 'Niciun rezultat.',
  description,
  hint,
  action,
  className,
}: EmptyMarketplaceStateProps): JSX.Element {
  return (
    <EmptyState
      title={title}
      description={description}
      hint={hint}
      action={action}
      icon={<MarketplaceIllustration />}
      className={className}
    />
  );
}
