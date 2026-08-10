// B2B Marketplace (admin / light) — page header (spec §1.10, §2.2).
//
// One pattern, two variants:
//   hero  → mov gradient strip rounded-[20px], frosted eyebrow pill, display
//           H1 (white), optional description, right-aligned actions.
//   shell → light hir-tint breadcrumb bar, H1, breadcrumb + actions.

import * as React from 'react';
import { cn } from '@hir/ui';

export interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  description?: string;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
  variant?: 'hero' | 'shell';
  className?: string;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  breadcrumb,
  actions,
  variant = 'shell',
  className,
}: PageHeaderProps): JSX.Element {
  if (variant === 'hero') {
    return (
      <header
        className={cn(
          'rounded-[20px] bg-gradient-to-br from-[#4a1063] via-[#6b1f8a] to-[#8e3bb0] p-6 text-white shadow-[0_8px_30px_rgba(35,9,58,0.18)] md:p-8',
          className,
        )}
      >
        {breadcrumb ? <div className="mb-3 text-sm text-white/80">{breadcrumb}</div> : null}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            {eyebrow ? (
              <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white ring-1 ring-inset ring-white/25 backdrop-blur">
                {eyebrow}
              </span>
            ) : null}
            <h1 className="mt-3 text-3xl font-black tracking-[-0.02em] md:text-4xl">{title}</h1>
            {description ? (
              <p className="mt-2 max-w-2xl text-sm text-white/90">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </header>
    );
  }

  return (
    <header
      className={cn(
        'rounded-2xl border border-[#e9d5f0] bg-[#f7f0fb] p-5 shadow-sm',
        className,
      )}
    >
      {breadcrumb ? <div className="mb-2 text-sm text-[#6b1f8a]">{breadcrumb}</div> : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6b1f8a]">
              {eyebrow}
            </span>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight text-[#23093a]">{title}</h1>
          {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
