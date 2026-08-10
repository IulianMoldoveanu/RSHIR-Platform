// B2B Marketplace (courier dark theme) — Card container primitive.
//
// Thin styled container (§2.3). No business logic. `rounded-2xl` surface card
// on the dark theme; `interactive` adds a hover lift + violet glow;
// `accent` adds a violet top hairline; `href` wraps the whole card in a Next
// Link so the entire surface is one click target (a11y + mobile).

import * as React from 'react';
import Link from 'next/link';

export interface CardProps {
  children: React.ReactNode;
  /** Render as a `<div>` (default) or an `<li>` (for stacked lists). */
  as?: 'div' | 'li';
  /** When set, the whole card becomes a Next Link to this href. */
  href?: string;
  /** Adds a violet top hairline accent. */
  accent?: boolean;
  /** Adds hover lift + violet glow + border highlight. */
  interactive?: boolean;
  className?: string;
}

const SURFACE =
  'relative overflow-hidden rounded-2xl border border-hir-border bg-hir-surface p-4';

const INTERACTIVE =
  'transition-all duration-200 hover:border-violet-500/40 hover:bg-hir-border/40 hover:shadow-[0_0_0_1px_rgba(139,92,246,0.15)] md:hover:-translate-y-0.5';

const ACCENT_BAR = (
  <span
    aria-hidden
    className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-violet-600 to-violet-400"
  />
);

export function Card({
  children,
  as = 'div',
  href,
  accent = false,
  interactive = false,
  className,
}: CardProps): JSX.Element {
  const cls = [SURFACE, interactive ? INTERACTIVE : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  const inner = (
    <>
      {accent ? ACCENT_BAR : null}
      {children}
    </>
  );

  if (href) {
    const link = (
      <Link href={href} className={[cls, 'block'].join(' ')}>
        {inner}
      </Link>
    );
    return as === 'li' ? <li>{link}</li> : link;
  }

  if (as === 'li') {
    return <li className={cls}>{inner}</li>;
  }
  return <div className={cls}>{inner}</div>;
}
