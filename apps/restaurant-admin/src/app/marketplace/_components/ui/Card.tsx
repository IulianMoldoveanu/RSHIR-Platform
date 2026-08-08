// B2B Marketplace (admin / light) — surface card (spec §2.3).
//
// Thin styled container. rounded-2xl border bg-white p-5. `accent` adds the
// top mov-gradient bar; `interactive` adds the hover lift + brand shadow;
// `href` wraps the whole card in a Next Link (whole-card click target — the
// a11y/mobile fix the audit asks for). No business logic here.

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@hir/ui';

export interface CardProps {
  children: React.ReactNode;
  as?: 'div' | 'li';
  href?: string;
  accent?: boolean;
  interactive?: boolean;
  className?: string;
}

const ACCENT_BAR =
  'before:absolute before:inset-x-0 before:top-0 before:h-1 before:rounded-t-2xl before:bg-gradient-to-r before:from-[#6b1f8a] before:to-[#8e3bb0] before:content-[""]';

const INTERACTIVE =
  'transition-all duration-200 hover:-translate-y-0.5 hover:border-[#e9d5f0] hover:shadow-[0_6px_24px_rgba(107,31,138,0.12)]';

export function Card({
  children,
  as = 'div',
  href,
  accent = false,
  interactive = false,
  className,
}: CardProps): JSX.Element {
  const classes = cn(
    'relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm',
    accent && ACCENT_BAR,
    (interactive || href) && INTERACTIVE,
    accent && 'pt-6',
    className,
  );

  if (href) {
    const link = (
      <Link href={href} className={cn('block', classes)}>
        {children}
      </Link>
    );
    return as === 'li' ? <li className="list-none">{link}</li> : link;
  }

  const Tag = as;
  return <Tag className={classes}>{children}</Tag>;
}
