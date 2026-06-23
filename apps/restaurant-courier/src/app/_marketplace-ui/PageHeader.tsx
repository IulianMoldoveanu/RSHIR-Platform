// B2B Marketplace (courier dark theme) — PageHeader primitive.
//
// Two variants of one pattern (§1.10):
//   - 'hero'  : dark strip with a violet gradient overlay over bg-hir-surface,
//               frosted/violet eyebrow pill, display H1 (zinc-50), optional
//               description + right-aligned actions.
//   - 'shell' : breadcrumb bar on bg-hir-surface — breadcrumb + title +
//               actions. This is the default.

import * as React from 'react';

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
        className={[
          'relative overflow-hidden rounded-[20px] border border-hir-border bg-hir-surface p-5 md:p-6',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Violet gradient overlay — the dark-theme equivalent of the mov hero strip. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-600/20 via-violet-500/10 to-transparent"
        />
        <div className="relative flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            {eyebrow ? (
              <span className="inline-flex items-center rounded-full bg-violet-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-violet-200 ring-1 ring-inset ring-violet-500/30">
                {eyebrow}
              </span>
            ) : null}
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-zinc-50">{title}</h1>
            {description ? (
              <p className="mt-1 max-w-prose text-sm text-zinc-300">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </header>
    );
  }

  return (
    <header
      className={[
        'rounded-2xl border border-hir-border bg-hir-surface px-4 py-3 md:px-5',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {breadcrumb ? <div className="mb-2 text-xs text-hir-muted-fg">{breadcrumb}</div> : null}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-300">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="truncate text-2xl font-semibold tracking-tight text-hir-fg">{title}</h1>
          {description ? <p className="mt-1 text-sm text-hir-muted-fg">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
